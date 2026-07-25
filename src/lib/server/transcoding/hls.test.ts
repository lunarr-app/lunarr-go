import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ENCODE_AHEAD_SEGMENT_COUNT,
  hlsEventPlaylistContainsSegment,
  hlsPlaylistBodySegmentFormat,
  hlsPlaylistSegmentEntries,
  hlsSegmentName,
  hlsSegmentResponse,
  materializedHlsPlaylist,
  resolveEncodeAheadSegmentCount,
  rewriteHlsPlaylistUris,
} from "./hls";

describe("HLS helpers", () => {
  test("uses MPEG-TS segment names and playlist version by default", () => {
    expect(hlsSegmentName(3)).toBe("segment-00003.ts");
    expect(
      materializedHlsPlaylist({
        keyframeTimes: null,
        durationSeconds: 20,
        segmentSeconds: 16,
      }),
    ).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:16",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        "#EXT-X-MEDIA-SEQUENCE:0",
        "#EXTINF:16.000,",
        "segments/segment-00000.ts",
        "#EXTINF:4.000,",
        "segments/segment-00001.ts",
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );
  });

  test("can build fMP4/CMAF-style virtual playlists", () => {
    expect(hlsSegmentName(3, "fmp4")).toBe("segment-00003.m4s");
    expect(
      materializedHlsPlaylist({
        keyframeTimes: null,
        durationSeconds: 20,
        segmentSeconds: 16,
        segmentFormat: "fmp4",
      }),
    ).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-TARGETDURATION:16",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        "#EXT-X-MEDIA-SEQUENCE:0",
        '#EXT-X-MAP:URI="segments/init.mp4"',
        "#EXTINF:16.000,",
        "segments/segment-00000.m4s",
        "#EXTINF:4.000,",
        "segments/segment-00001.m4s",
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );
  });

  test("detects fMP4 playlists from init maps and segment names", () => {
    expect(
      hlsPlaylistBodySegmentFormat(
        ["#EXTM3U", "#EXT-X-VERSION:7", '#EXT-X-MAP:URI="init.mp4"', "#EXTINF:16.000,", "segment-00000.m4s", ""].join(
          "\n",
        ),
      ),
    ).toBe("fmp4");
    expect(
      hlsPlaylistBodySegmentFormat(["#EXTM3U", "#EXTINF:16.000,", "segments/segment-00000.ts", ""].join("\n")),
    ).toBe("mpegts");
  });

  test("parses FFmpeg event playlist segment timing", () => {
    const playlist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:30",
      "#EXT-X-MEDIA-SEQUENCE:10",
      "#EXT-X-PLAYLIST-TYPE:EVENT",
      "#EXTINF:29.947000,",
      "segment-00010.ts",
      "#EXTINF:16.001000,",
      "segments/segment-00011.ts?cache=1",
      "",
    ].join("\n");

    expect(hlsPlaylistSegmentEntries(playlist, "/tmp/lunarr/master.m3u8")).toEqual([
      {
        segment: "segment-00010.ts",
        segmentIndex: 10,
        durationSeconds: 29.947,
        sequenceNumber: 10,
        startSeconds: 0,
      },
      {
        segment: "segment-00011.ts",
        segmentIndex: 11,
        durationSeconds: 16.001,
        sequenceNumber: 11,
        startSeconds: 29.947,
      },
    ]);
    expect(
      hlsEventPlaylistContainsSegment({
        playlist,
        playlistPath: "/tmp/lunarr/master.m3u8",
        segment: "segment-00011.ts",
      }),
    ).toBe(true);
  });

  test("does not treat virtual VOD playlists as FFmpeg event readiness", () => {
    const playlist = materializedHlsPlaylist({
      keyframeTimes: null,
      durationSeconds: 32,
      segmentSeconds: 16,
    });

    expect(
      hlsEventPlaylistContainsSegment({
        playlist,
        playlistPath: "/tmp/lunarr/master.m3u8",
        segment: "segment-00000.ts",
      }),
    ).toBe(false);
  });

  test("materializedHlsPlaylist falls back to the fixed grid when keyframeTimes is null", () => {
    expect(
      materializedHlsPlaylist({
        keyframeTimes: null,
        durationSeconds: 20,
        segmentSeconds: 16,
      }),
    ).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:16",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        "#EXT-X-MEDIA-SEQUENCE:0",
        "#EXTINF:16.000,",
        "segments/segment-00000.ts",
        "#EXTINF:4.000,",
        "segments/segment-00001.ts",
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );
  });

  test("materializedHlsPlaylist uses real per-segment durations when keyframeTimes is supplied", () => {
    // Keyframes at 0, 17.84, 35.52, 52.8, 64.0 — ffmpeg's remux would cut
    // segments near these times. With hls_time=16, ffmpeg cuts at the first
    // KF whose accumulated elapsed since the last cut is >= 16s:
    //   0 -> 17.84 (elapsed 17.84 >= 16: new boundary)
    //   17.84 -> 35.52 (elapsed 17.68: new boundary)
    //   35.52 -> 52.8  (elapsed 17.28: new boundary)
    //   52.8 -> 64.0   (elapsed 11.2 < 16: merge into previous)
    // Final segments: [17.84, 17.68, 17.28, 11.2]
    const playlist = materializedHlsPlaylist({
      keyframeTimes: [0, 17.84, 35.52, 52.8, 64.0],
      durationSeconds: 64,
      segmentSeconds: 16,
    });
    const lines = playlist.split("\n");
    expect(lines[0]).toBe("#EXTM3U");
    expect(lines).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(lines).toContain("#EXT-X-TARGETDURATION:18");
    const inf = lines.filter((line) => line.startsWith("#EXTINF:"));
    // Sum should equal durationSeconds.
    const sum = inf.reduce((acc, line) => acc + Number(line.slice("#EXTINF:".length, -1)), 0);
    expect(sum).toBeCloseTo(64, 6);
    expect(inf).toEqual(["#EXTINF:17.840,", "#EXTINF:17.680,", "#EXTINF:17.280,", "#EXTINF:11.200,"]);
    expect(lines.at(-2)).toBe("#EXT-X-ENDLIST");
  });

  test("materializedHlsPlaylist pads the head with a 0 keyframe when the container omits it", () => {
    // The container reports the first KF at 0.08s. ffmpeg re-anchors the
    // timeline at t=0 (via `-avoid_negative_ts make_zero` + `-ss`), so we
    // synthesize a virtual 0 boundary. The 0.08s KF falls inside segment 0
    // and is not promoted to a boundary (elapsed time < <segmentSeconds>),
    // so we still get 2 segments with the first starting at 0.
    const playlist = materializedHlsPlaylist({
      keyframeTimes: [0.08, 16.5, 33.1],
      durationSeconds: 33.1,
      segmentSeconds: 16,
    });
    const inf = playlist
      .split("\n")
      .filter((line) => line.startsWith("#EXTINF:"))
      .map((line) => Number(line.slice("#EXTINF:".length, -1)));
    expect(inf.length).toBe(2);
    expect(inf[0]).toBeCloseTo(16.5, 6);
    expect(inf[1]).toBeCloseTo(16.6, 6);
  });

  test("materializedHlsPlaylist supports fMP4 segment format with init.mp4 map", () => {
    expect(
      materializedHlsPlaylist({
        keyframeTimes: null,
        durationSeconds: 20,
        segmentSeconds: 16,
        segmentFormat: "fmp4",
      }),
    ).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-TARGETDURATION:16",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        "#EXT-X-MEDIA-SEQUENCE:0",
        '#EXT-X-MAP:URI="segments/init.mp4"',
        "#EXTINF:16.000,",
        "segments/segment-00000.m4s",
        "#EXTINF:4.000,",
        "segments/segment-00001.m4s",
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );
  });

  test("materializedHlsPlaylist includes EXT-X-START when startTimeSeconds is positive", () => {
    const playlist = materializedHlsPlaylist({
      keyframeTimes: null,
      durationSeconds: 13,
      startTimeSeconds: 5,
      segmentSeconds: 16,
    });
    expect(playlist).toContain("#EXT-X-START:TIME-OFFSET=5.000");
    expect(playlist).toContain("#EXTINF:13.000,");
  });

  test("materializedHlsPlaylist uses ceil(max duration) as target duration when keyframe segments exceed 16s", () => {
    const playlist = materializedHlsPlaylist({
      keyframeTimes: [0, 19.2, 38.4],
      durationSeconds: 38.4,
      segmentSeconds: 16,
    });
    expect(playlist).toContain("#EXT-X-TARGETDURATION:20");
  });

  test("rewrites FFmpeg-authored fMP4 init maps through the segment route", () => {
    expect(
      rewriteHlsPlaylistUris(
        [
          "#EXTM3U",
          "#EXT-X-VERSION:7",
          '#EXT-X-MAP:URI="init.mp4"',
          "#EXTINF:16.000,",
          "segment-00000.m4s",
          "#EXTINF:8.000,",
          "nested/segment-00001.m4s",
          "#EXT-X-ENDLIST",
          "",
        ].join("\n"),
        "/tmp/lunarr-hls/master.m3u8",
      ),
    ).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        '#EXT-X-MAP:URI="segments/init.mp4"',
        "#EXTINF:16.000,",
        "segments/segment-00000.m4s",
        "#EXTINF:8.000,",
        "segments/segment-00001.m4s",
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );
  });

  test("does not rewrite unsafe or non-segment HLS tag URIs", () => {
    expect(
      rewriteHlsPlaylistUris(
        [
          "#EXTM3U",
          '#EXT-X-MAP:URI="../init.mp4"',
          '#EXT-X-KEY:METHOD=AES-128,URI="segment-00000.ts"',
          '#EXT-X-SESSION-DATA:DATA-ID="com.example",URI="metadata.json"',
          "#EXTINF:16.000,",
          "segment-00000.ts",
          "",
        ].join("\n"),
        "/tmp/lunarr-hls/master.m3u8",
      ),
    ).toBe(
      [
        "#EXTM3U",
        '#EXT-X-MAP:URI="../init.mp4"',
        '#EXT-X-KEY:METHOD=AES-128,URI="segment-00000.ts"',
        '#EXT-X-SESSION-DATA:DATA-ID="com.example",URI="metadata.json"',
        "#EXTINF:16.000,",
        "segments/segment-00000.ts",
        "",
      ].join("\n"),
    );
  });

  test("serves segments from a shared encode directory when provided", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-hls-encode-dir-"));
    try {
      const playlistDir = path.join(tempDir, "session");
      const encodeDir = path.join(tempDir, "playback-cache", "cache-1");
      const playlistPath = path.join(playlistDir, "master.m3u8");
      await mkdir(playlistDir, { recursive: true });
      await writeFile(playlistPath, "#EXTM3U\n");
      await mkdir(encodeDir, { recursive: true });
      await writeFile(path.join(encodeDir, "segment-00001.ts"), "cached-segment");

      const response = await hlsSegmentResponse(playlistPath, "segment-00001.ts", {
        encodeDirectory: encodeDir,
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("cached-segment");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("returns 404 when the segment file is missing", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-hls-missing-segment-"));
    try {
      const playlistDir = path.join(tempDir, "session");
      const playlistPath = path.join(playlistDir, "master.m3u8");
      await mkdir(playlistDir, { recursive: true });
      await writeFile(playlistPath, "#EXTM3U\n");

      const response = await hlsSegmentResponse(playlistPath, "segment-00001.ts");

      expect(response.status).toBe(404);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("skips non-file candidates and serves the segment from a later directory", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-hls-segment-candidates-"));
    try {
      const playlistDir = path.join(tempDir, "session");
      const encodeDir = path.join(tempDir, "playback-cache", "cache-1");
      const playlistPath = path.join(playlistDir, "master.m3u8");
      await mkdir(playlistDir, { recursive: true });
      await mkdir(encodeDir, { recursive: true });
      await writeFile(playlistPath, "#EXTM3U\n");
      await mkdir(path.join(encodeDir, "segment-00001.ts"), { recursive: true });
      await writeFile(path.join(playlistDir, "segment-00001.ts"), "playlist-dir-segment");

      const response = await hlsSegmentResponse(playlistPath, "segment-00001.ts", {
        encodeDirectory: encodeDir,
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("playlist-dir-segment");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("sets content-length to the served segment body length", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-hls-segment-length-"));
    try {
      const playlistDir = path.join(tempDir, "session");
      const playlistPath = path.join(playlistDir, "master.m3u8");
      await mkdir(playlistDir, { recursive: true });
      await writeFile(playlistPath, "#EXTM3U\n");
      const segmentBody = "segment-bytes-0123456789";
      await writeFile(path.join(playlistDir, "segment-00001.ts"), segmentBody);

      const response = await hlsSegmentResponse(playlistPath, "segment-00001.ts");

      expect(response.status).toBe(200);
      const body = await response.arrayBuffer();
      expect(response.headers.get("content-length")).toBe(String(body.byteLength));
      expect(body.byteLength).toBe(segmentBody.length);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("resolveEncodeAheadSegmentCount", () => {
  test("uses a positive value as-is", () => {
    expect(resolveEncodeAheadSegmentCount(2)).toBe(2);
    expect(resolveEncodeAheadSegmentCount(8)).toBe(8);
  });

  test("falls back to the default for missing or non-positive values", () => {
    expect(resolveEncodeAheadSegmentCount(undefined)).toBe(ENCODE_AHEAD_SEGMENT_COUNT);
    expect(resolveEncodeAheadSegmentCount(null)).toBe(ENCODE_AHEAD_SEGMENT_COUNT);
    expect(resolveEncodeAheadSegmentCount(0)).toBe(ENCODE_AHEAD_SEGMENT_COUNT);
    expect(resolveEncodeAheadSegmentCount(-3)).toBe(ENCODE_AHEAD_SEGMENT_COUNT);
    expect(resolveEncodeAheadSegmentCount(NaN)).toBe(ENCODE_AHEAD_SEGMENT_COUNT);
  });
});
