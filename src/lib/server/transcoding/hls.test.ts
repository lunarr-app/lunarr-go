import { describe, expect, test } from "bun:test";
import {
  hlsEventPlaylistContainsSegment,
  hlsPlaylistBodySegmentFormat,
  hlsPlaylistSegmentEntries,
  hlsSegmentName,
  rewriteHlsPlaylistUris,
  virtualHlsPlaylist,
} from "./hls";

describe("HLS helpers", () => {
  test("uses MPEG-TS segment names and playlist version by default", () => {
    expect(hlsSegmentName(3)).toBe("segment-00003.ts");
    expect(
      virtualHlsPlaylist({
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
      virtualHlsPlaylist({
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
    const playlist = virtualHlsPlaylist({
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
});
