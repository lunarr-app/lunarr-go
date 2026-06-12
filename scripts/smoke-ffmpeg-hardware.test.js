import { describe, expect, test } from "bun:test";
import { hardwareSmokeEnv } from "./smoke-ffmpeg-hardware.mjs";

describe("FFmpeg hardware smoke wrapper", () => {
  test("defaults hardware smoke and verification to auto", () => {
    expect(hardwareSmokeEnv({})).toEqual({
      FFMPEG_SMOKE_HARDWARE: "auto",
      FFMPEG_VERIFY_HARDWARE: "auto",
    });
  });

  test("uses explicit smoke mode for verification when verify mode is absent", () => {
    expect(hardwareSmokeEnv({ FFMPEG_SMOKE_HARDWARE: "nvenc" })).toEqual({
      FFMPEG_SMOKE_HARDWARE: "nvenc",
      FFMPEG_VERIFY_HARDWARE: "nvenc",
    });
  });

  test("keeps explicit verify mode while defaulting smoke from it", () => {
    expect(hardwareSmokeEnv({ FFMPEG_VERIFY_HARDWARE: "vaapi" })).toEqual({
      FFMPEG_VERIFY_HARDWARE: "vaapi",
      FFMPEG_SMOKE_HARDWARE: "vaapi",
    });
  });
});
