import { describe, expect, test } from "bun:test";
import { decidePlaybackMode, isDirectPlayCompatible, isRemuxCompatible } from "./capabilities";

describe("transcode capabilities", () => {
  test("detects conservative browser direct-play compatibility", () => {
    expect(isDirectPlayCompatible({ extension: ".mp4", container: "mp4", videoCodec: "h264", audioCodec: "aac" })).toBe(true);
    expect(isDirectPlayCompatible({ extension: ".mp4", container: "mp4", videoCodec: null, audioCodec: null })).toBe(true);
    expect(isDirectPlayCompatible({ extension: ".mkv", container: "matroska", videoCodec: "h264", audioCodec: "aac" })).toBe(false);
    expect(isDirectPlayCompatible({ extension: ".mp4", container: "mp4", videoCodec: "hevc", audioCodec: "aac" })).toBe(false);
    expect(isDirectPlayCompatible({ extension: ".mp4", container: "mp4", videoCodec: "h264", audioCodec: "dts" })).toBe(false);
  });

  test("detects remux compatibility when only the container is unsupported", () => {
    expect(isRemuxCompatible({ extension: ".mkv", container: "matroska", videoCodec: "h264", audioCodec: "aac" })).toBe(true);
    expect(isRemuxCompatible({ extension: ".mp4", container: "mp4", videoCodec: "h264", audioCodec: "aac" })).toBe(false);
    expect(isRemuxCompatible({ extension: ".mkv", container: "matroska", videoCodec: "hevc", audioCodec: "aac" })).toBe(false);
    expect(isRemuxCompatible({ extension: ".mkv", container: "matroska", videoCodec: "h264", audioCodec: "dts" })).toBe(false);
  });

  test("chooses direct, transcode, or unavailable from policy", () => {
    const directFile = { extension: ".mp4", container: "mp4", videoCodec: "h264", audioCodec: "aac" };
    const remuxFile = { extension: ".mkv", container: "matroska", videoCodec: "h264", audioCodec: "aac" };
    const unsupportedFile = { extension: ".mkv", container: "matroska", videoCodec: "hevc", audioCodec: "dts" };

    expect(decidePlaybackMode({ file: directFile, policy: { transcodingEnabled: true, playbackPreference: "auto" } })).toEqual({
      mode: "direct",
      reason: "direct_supported"
    });
    expect(decidePlaybackMode({ file: directFile, policy: { transcodingEnabled: true, playbackPreference: "prefer_transcode" } })).toEqual({
      mode: "transcode",
      reason: "user_preference"
    });
    expect(decidePlaybackMode({ file: unsupportedFile, policy: { transcodingEnabled: true, playbackPreference: "prefer_direct" } })).toEqual({
      mode: "transcode",
      reason: "direct_unsupported"
    });
    expect(decidePlaybackMode({ file: remuxFile, policy: { transcodingEnabled: true, playbackPreference: "auto" } })).toEqual({
      mode: "remux",
      reason: "container_unsupported"
    });
    expect(decidePlaybackMode({ file: unsupportedFile, policy: { transcodingEnabled: false, playbackPreference: "auto" } })).toEqual({
      mode: "unavailable",
      reason: "transcoding_disabled"
    });
  });
});
