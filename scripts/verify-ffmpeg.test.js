import { describe, expect, test } from "bun:test";
import {
  hardwareModesToVerify,
  verifyFfmpegPlaybackRequirements,
} from "./verify-ffmpeg.mjs";

const VERSION_OUTPUT = "ffmpeg version test";
const MUXERS_OUTPUT = " E hls             Apple HTTP Live Streaming";
const ENCODERS_OUTPUT = [
  " V....D libx264          libx264 H.264 / AVC",
  " A..... aac              AAC",
  " V....D h264_videotoolbox VideoToolbox H.264",
  " V....D h264_vaapi       VAAPI H.264",
  " V....D h264_qsv         Intel QSV H.264",
  " V....D h264_nvenc       NVIDIA NVENC H.264",
  " V....D h264_amf         AMD AMF H.264",
].join("\n");

function runFromOutputs(outputs = {}) {
  return (args) => {
    if (args.includes("-version")) return outputs.version ?? VERSION_OUTPUT;
    if (args.includes("-muxers")) return outputs.muxers ?? MUXERS_OUTPUT;
    if (args.includes("-encoders")) return outputs.encoders ?? ENCODERS_OUTPUT;
    throw new Error(`Unexpected FFmpeg args: ${args.join(" ")}`);
  };
}

describe("FFmpeg playback verifier", () => {
  test("verifies baseline software playback requirements", () => {
    const result = verifyFfmpegPlaybackRequirements({
      env: {},
      run: runFromOutputs(),
    });

    expect(result).toEqual({
      versionLine: VERSION_OUTPUT,
      hardwareModes: [],
      hardwareEncoders: [],
    });
  });

  test("maps auto hardware verification to the platform default", () => {
    expect(hardwareModesToVerify("auto", "darwin")).toEqual(["videotoolbox"]);
    expect(hardwareModesToVerify("auto", "win32")).toEqual(["qsv"]);
    expect(hardwareModesToVerify("auto", "linux")).toEqual(["vaapi"]);
  });

  test("verifies explicitly requested hardware encoders", () => {
    const result = verifyFfmpegPlaybackRequirements({
      env: { FFMPEG_VERIFY_HARDWARE: "nvenc,amf,nvenc" },
      run: runFromOutputs(),
    });

    expect(result.hardwareModes).toEqual(["nvenc", "amf"]);
    expect(result.hardwareEncoders).toEqual(["h264_nvenc", "h264_amf"]);
  });

  test("fails when a requested hardware encoder is missing", () => {
    expect(() =>
      verifyFfmpegPlaybackRequirements({
        env: { FFMPEG_VERIFY_HARDWARE: "nvenc" },
        run: runFromOutputs({
          encoders: ENCODERS_OUTPUT.replace(/^.*h264_nvenc.*$/m, ""),
        }),
      }),
    ).toThrow("FFmpeg is missing required nvenc H.264 encoder");
  });

  test("rejects unsupported hardware verifier modes", () => {
    expect(() => hardwareModesToVerify("bad")).toThrow(
      'Unsupported FFMPEG_VERIFY_HARDWARE mode "bad"',
    );
  });
});
