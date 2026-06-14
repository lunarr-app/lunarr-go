import { describe, expect, test } from "bun:test";
import { runRuntimeVerification, runtimeVerificationEnv } from "./verify-runtime.mjs";

describe("Lunarr runtime verifier", () => {
  test("keeps software-only verification environment unchanged", () => {
    const env = { FFMPEG_PATH: "/usr/bin/ffmpeg" };

    expect(runtimeVerificationEnv(env)).toBe(env);
  });

  test("uses explicit runtime hardware mode for encoder verification and smoke", () => {
    expect(runtimeVerificationEnv({ LUNARR_VERIFY_HARDWARE: "vaapi" })).toEqual({
      LUNARR_VERIFY_HARDWARE: "vaapi",
      FFMPEG_SMOKE_HARDWARE: "vaapi",
      FFMPEG_VERIFY_HARDWARE: "vaapi",
    });
  });

  test("keeps explicit FFmpeg hardware verifier mode", () => {
    expect(
      runtimeVerificationEnv({
        LUNARR_VERIFY_HARDWARE: "vaapi",
        FFMPEG_VERIFY_HARDWARE: "nvenc",
      }),
    ).toEqual({
      LUNARR_VERIFY_HARDWARE: "vaapi",
      FFMPEG_VERIFY_HARDWARE: "nvenc",
      FFMPEG_SMOKE_HARDWARE: "vaapi",
    });
  });

  test("runs FFmpeg verifier, FFmpeg playback smoke, and NodeAV probe verifier", async () => {
    const calls = [];
    const logs = [];
    await runRuntimeVerification(
      { LUNARR_VERIFY_HARDWARE: "auto" },
      {
        log(message) {
          logs.push(message);
        },
        verifyFfmpeg(options) {
          calls.push(["verifyFfmpeg", options.env]);
          return {
            versionLine: "ffmpeg version test",
            hardwareModes: ["vaapi"],
            hardwareEncoders: ["h264_vaapi"],
          };
        },
        smokeFfmpeg(env) {
          calls.push(["smokeFfmpeg", env]);
        },
        async verifyNodeAv(env) {
          calls.push(["verifyNodeAv", env]);
        },
      },
    );

    expect(calls).toEqual([
      [
        "verifyFfmpeg",
        {
          LUNARR_VERIFY_HARDWARE: "auto",
          FFMPEG_SMOKE_HARDWARE: "auto",
          FFMPEG_VERIFY_HARDWARE: "auto",
        },
      ],
      [
        "smokeFfmpeg",
        {
          LUNARR_VERIFY_HARDWARE: "auto",
          FFMPEG_SMOKE_HARDWARE: "auto",
          FFMPEG_VERIFY_HARDWARE: "auto",
        },
      ],
      [
        "verifyNodeAv",
        {
          LUNARR_VERIFY_HARDWARE: "auto",
          FFMPEG_SMOKE_HARDWARE: "auto",
          FFMPEG_VERIFY_HARDWARE: "auto",
        },
      ],
    ]);
    expect(logs).toContain("Lunarr playback runtime verification passed.");
  });
});
