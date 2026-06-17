import { describe, expect, test } from "bun:test";
import { decidePlaybackMode, isDirectPlayCompatible, isRemuxCompatible } from "./capabilities";

describe("transcode capabilities", () => {
  test("detects conservative browser direct-play compatibility", () => {
    expect(
      isDirectPlayCompatible({
        extension: ".mp4",
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
      }),
    ).toBe(true);
    expect(
      isDirectPlayCompatible({
        extension: ".mp4",
        container: "mp4",
        videoCodec: null,
        audioCodec: null,
      }),
    ).toBe(true);
    expect(
      isDirectPlayCompatible({
        extension: ".mkv",
        container: "matroska",
        videoCodec: "h264",
        audioCodec: "aac",
      }),
    ).toBe(false);
    expect(
      isDirectPlayCompatible({
        extension: ".mp4",
        container: "mp4",
        videoCodec: "hevc",
        audioCodec: "aac",
      }),
    ).toBe(false);
    expect(
      isDirectPlayCompatible({
        extension: ".mp4",
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "dts",
      }),
    ).toBe(false);
  });

  test("uses explicit client HEVC support for direct play", () => {
    const hevcMp4 = {
      extension: ".mp4",
      container: "mp4",
      videoCodec: "hevc",
      audioCodec: "aac",
    };

    expect(isDirectPlayCompatible(hevcMp4)).toBe(false);
    expect(isDirectPlayCompatible(hevcMp4, { hevc: true })).toBe(true);
    expect(
      decidePlaybackMode({
        file: hevcMp4,
        policy: { transcodingEnabled: true, playbackPreference: "auto" },
        clientCapabilities: { hevc: true },
      }),
    ).toEqual({
      mode: "direct",
      reason: "direct_supported",
    });
  });

  test("uses explicit client AV1 support for MP4 direct play", () => {
    const av1Mp4 = {
      extension: ".mp4",
      container: "mp4",
      videoCodec: "av1",
      audioCodec: "aac",
    };

    expect(isDirectPlayCompatible(av1Mp4)).toBe(false);
    expect(isDirectPlayCompatible(av1Mp4, { av1: true })).toBe(true);
  });

  test("recognizes codec-string aliases for direct play decisions", () => {
    expect(
      isDirectPlayCompatible({
        extension: ".mp4",
        container: "mp4",
        videoCodec: "avc1.640028",
        audioCodec: "mp4a.40.2",
      }),
    ).toBe(true);
    expect(
      isDirectPlayCompatible(
        {
          extension: ".mp4",
          container: "mp4",
          videoCodec: "av01.0.08M.08",
          audioCodec: "mp4a.40.2",
        },
        { av1: true },
      ),
    ).toBe(true);
    expect(
      isDirectPlayCompatible(
        {
          extension: ".webm",
          container: "matroska,webm",
          videoCodec: "vp09.00.10.08",
          audioCodec: "opus",
        },
        { webm: true, vp9: true, opus: true },
      ),
    ).toBe(true);
  });

  test("uses explicit client WebM codec support for WebM direct play", () => {
    const webm = {
      extension: ".webm",
      container: "matroska,webm",
      videoCodec: "vp9",
      audioCodec: "opus",
    };

    expect(isDirectPlayCompatible(webm)).toBe(false);
    expect(isDirectPlayCompatible(webm, { webm: true, vp9: true })).toBe(false);
    expect(isDirectPlayCompatible(webm, { webm: true, vp9: true, opus: true })).toBe(true);
  });

  test("uses native target for universal direct play and skips HLS remux", () => {
    const mkv = {
      extension: ".mkv",
      container: "matroska",
      videoCodec: "hevc",
      audioCodec: "dts",
    };

    expect(isDirectPlayCompatible(mkv, null, "native")).toBe(true);
    expect(isRemuxCompatible(mkv, null, "mpegts", "native")).toBe(false);
    expect(
      decidePlaybackMode({
        file: mkv,
        policy: {
          transcodingEnabled: true,
          playbackPreference: "prefer_transcode",
        },
        target: "native",
      }),
    ).toEqual({
      mode: "direct",
      reason: "direct_supported",
    });
    expect(
      decidePlaybackMode({
        file: {
          extension: ".mkv",
          container: "matroska",
          videoCodec: "h264",
          audioCodec: "aac",
        },
        policy: { transcodingEnabled: true, playbackPreference: "auto" },
        target: "native",
      }),
    ).toEqual({
      mode: "direct",
      reason: "direct_supported",
    });
  });

  test("marks native playback unavailable when file metadata is missing", () => {
    const unknownFile = {
      extension: null,
      container: null,
      videoCodec: "h264",
      audioCodec: "aac",
    };

    expect(isDirectPlayCompatible(unknownFile, null, "native")).toBe(false);
    expect(
      decidePlaybackMode({
        file: unknownFile,
        policy: { transcodingEnabled: true, playbackPreference: "auto" },
        target: "native",
      }),
    ).toEqual({
      mode: "unavailable",
      reason: "transcoding_disabled",
    });
  });

  test("uses target-specific direct play profiles", () => {
    const webm = {
      extension: ".webm",
      container: "matroska,webm",
      videoCodec: "vp9",
      audioCodec: "opus",
    };
    const hevcMp4 = {
      extension: ".mp4",
      container: "mp4",
      videoCodec: "hevc",
      audioCodec: "aac",
    };

    expect(isDirectPlayCompatible(webm, { webm: true, vp9: true, opus: true }, "web")).toBe(true);
    expect(isDirectPlayCompatible(webm, { webm: true, vp9: true, opus: true }, "cast")).toBe(false);
    expect(isDirectPlayCompatible(webm, { webm: true, vp9: true, opus: true }, "airplay")).toBe(false);
    expect(isDirectPlayCompatible(hevcMp4, { hevc: true }, "web")).toBe(true);
    expect(isDirectPlayCompatible(hevcMp4, { hevc: true }, "cast")).toBe(false);
    expect(isDirectPlayCompatible(hevcMp4, { hevc: true }, "airplay")).toBe(true);
  });

  test("uses target-specific HLS remux profiles", () => {
    const hevcMkv = {
      extension: ".mkv",
      container: "matroska",
      videoCodec: "hevc",
      audioCodec: "aac",
    };

    expect(isRemuxCompatible(hevcMkv, { hevc: true, hlsNative: true, hlsFmp4: true }, "fmp4", "web")).toBe(true);
    expect(isRemuxCompatible(hevcMkv, { hevc: true, hlsNative: true, hlsFmp4: true }, "fmp4", "cast")).toBe(false);
    expect(isRemuxCompatible(hevcMkv, { hevc: true }, "fmp4", "airplay")).toBe(true);
    expect(isRemuxCompatible(hevcMkv, { hlsNative: true, hlsFmp4: true }, "fmp4", "cast")).toBe(false);
  });

  test("detects remux compatibility when only the container is unsupported", () => {
    expect(
      isRemuxCompatible({
        extension: ".mkv",
        container: "matroska",
        videoCodec: "h264",
        audioCodec: "aac",
      }),
    ).toBe(true);
    expect(
      isRemuxCompatible({
        extension: ".mp4",
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
      }),
    ).toBe(false);
    expect(
      isRemuxCompatible({
        extension: ".mkv",
        container: "matroska",
        videoCodec: "hevc",
        audioCodec: "aac",
      }),
    ).toBe(false);
    expect(
      isRemuxCompatible(
        {
          extension: ".mkv",
          container: "matroska",
          videoCodec: "hevc",
          audioCodec: "aac",
        },
        { hevc: true, hlsNative: true, hlsFmp4: true },
      ),
    ).toBe(false);
    expect(
      isRemuxCompatible(
        {
          extension: ".mkv",
          container: "matroska",
          videoCodec: "hevc",
          audioCodec: "aac",
        },
        { hevc: true, hlsNative: true, hlsFmp4: true },
        "fmp4",
      ),
    ).toBe(true);
    expect(
      isRemuxCompatible(
        {
          extension: ".mkv",
          container: "matroska",
          videoCodec: "hevc",
          audioCodec: "aac",
        },
        { hevc: true, hlsFmp4: true },
        "fmp4",
      ),
    ).toBe(false);
    expect(
      isRemuxCompatible({
        extension: ".mkv",
        container: "matroska",
        videoCodec: null,
        audioCodec: "aac",
      }),
    ).toBe(false);
    expect(
      isRemuxCompatible(
        {
          extension: ".mkv",
          container: "matroska",
          videoCodec: null,
          audioCodec: "aac",
        },
        { hevc: true, hlsNative: true, hlsFmp4: true },
        "fmp4",
      ),
    ).toBe(false);
    expect(
      isRemuxCompatible({
        extension: ".mkv",
        container: "matroska",
        videoCodec: "h264",
        audioCodec: null,
      }),
    ).toBe(false);
    expect(
      isRemuxCompatible(
        {
          extension: ".mkv",
          container: "matroska",
          videoCodec: "hevc",
          audioCodec: null,
        },
        { hevc: true, hlsNative: true, hlsFmp4: true },
        "fmp4",
      ),
    ).toBe(false);
    expect(
      isRemuxCompatible({
        extension: ".mkv",
        container: "matroska",
        videoCodec: "h264",
        audioCodec: "dts",
      }),
    ).toBe(false);
  });

  test("recognizes codec-string aliases for HLS remux decisions", () => {
    expect(
      isRemuxCompatible({
        extension: ".mkv",
        container: "matroska",
        videoCodec: "avc1.4d401f",
        audioCodec: "mp4a.40.2",
      }),
    ).toBe(true);
    expect(
      isRemuxCompatible(
        {
          extension: ".mkv",
          container: "matroska",
          videoCodec: "hvc1.1.6.L93.B0",
          audioCodec: "mp4a.40.2",
        },
        { hevc: true, hlsNative: true, hlsFmp4: true },
        "fmp4",
      ),
    ).toBe(true);
  });

  test("chooses direct, transcode, or unavailable from policy", () => {
    const directFile = {
      extension: ".mp4",
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
    };
    const remuxFile = {
      extension: ".mkv",
      container: "matroska",
      videoCodec: "h264",
      audioCodec: "aac",
    };
    const unsupportedFile = {
      extension: ".mkv",
      container: "matroska",
      videoCodec: "hevc",
      audioCodec: "dts",
    };

    expect(
      decidePlaybackMode({
        file: directFile,
        policy: { transcodingEnabled: true, playbackPreference: "auto" },
        target: "cast",
      }),
    ).toEqual({
      mode: "direct",
      reason: "direct_supported",
    });
    expect(
      decidePlaybackMode({
        file: directFile,
        policy: {
          transcodingEnabled: true,
          playbackPreference: "prefer_transcode",
        },
      }),
    ).toEqual({
      mode: "transcode",
      reason: "user_preference",
    });
    expect(
      decidePlaybackMode({
        file: unsupportedFile,
        policy: {
          transcodingEnabled: true,
          playbackPreference: "prefer_direct",
        },
      }),
    ).toEqual({
      mode: "transcode",
      reason: "direct_unsupported",
    });
    expect(
      decidePlaybackMode({
        file: remuxFile,
        policy: { transcodingEnabled: true, playbackPreference: "auto" },
      }),
    ).toEqual({
      mode: "remux",
      reason: "container_unsupported",
    });
    expect(
      decidePlaybackMode({
        file: unsupportedFile,
        policy: { transcodingEnabled: false, playbackPreference: "auto" },
      }),
    ).toEqual({
      mode: "unavailable",
      reason: "transcoding_disabled",
    });
  });
});
