import { describe, expect, test } from "bun:test";
import {
  hardwareHlsSmokeArgs,
  hardwareRuntimePrerequisiteErrors,
  hardwareSmokeModes,
  remuxHlsSmokeArgs,
  softwareHlsSmokeArgs,
} from "./smoke-ffmpeg-transcode.mjs";

const SMOKE_INPUT = {
  sourcePath: "/tmp/source.mp4",
  playlistPath: "/tmp/hls/master.m3u8",
  segmentPattern: "/tmp/hls/segment-%05d.ts",
};

describe("FFmpeg transcode smoke command", () => {
  test("builds a software HLS transcode smoke command", () => {
    const args = softwareHlsSmokeArgs(SMOKE_INPUT);

    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args).toContain("-hls_segment_filename");
    expect(args).toContain("/tmp/hls/segment-%05d.ts");
    expect(args.at(-1)).toBe("/tmp/hls/master.m3u8");
  });

  test("builds a copied-remux HLS smoke command", () => {
    const args = remuxHlsSmokeArgs(SMOKE_INPUT);

    expect(args).toContain("copy");
    expect(args).not.toContain("libx264");
    expect(args).toContain("-hls_playlist_type");
    expect(args).toContain("event");
    expect(args).toContain("temp_file");
    expect(args).not.toContain("independent_segments+temp_file");
    expect(args).toContain("-hls_segment_filename");
    expect(args.at(-1)).toBe("/tmp/hls/master.m3u8");
  });

  test("maps auto hardware smoke to the platform default", () => {
    expect(
      hardwareSmokeModes({ FFMPEG_SMOKE_HARDWARE: "auto" }, "darwin"),
    ).toEqual(["videotoolbox"]);
    expect(
      hardwareSmokeModes({ FFMPEG_SMOKE_HARDWARE: "auto" }, "linux"),
    ).toEqual(["vaapi"]);
  });

  test("builds a VAAPI hardware HLS smoke command with the configured device", () => {
    const args = hardwareHlsSmokeArgs({
      ...SMOKE_INPUT,
      mode: "vaapi",
      env: { FFMPEG_VAAPI_DEVICE: "/dev/dri/custom" },
    });

    expect(args).toContain("-vaapi_device");
    expect(args).toContain("/dev/dri/custom");
    expect(args).toContain("format=nv12,hwupload");
    expect(args).toContain("h264_vaapi");
    expect(args).toContain("-an");
  });

  test("reports missing VAAPI runtime device before running hardware smoke", () => {
    expect(
      hardwareRuntimePrerequisiteErrors(
        "vaapi",
        { FFMPEG_VAAPI_DEVICE: "/dev/dri/missing" },
        () => false,
      ),
    ).toEqual([
      'VAAPI device "/dev/dri/missing" is not available. Mount the host render device into the runtime or set FFMPEG_VAAPI_DEVICE to the mounted render device path.',
    ]);
  });

  test("accepts a mounted VAAPI runtime device", () => {
    expect(
      hardwareRuntimePrerequisiteErrors(
        "vaapi",
        { FFMPEG_VAAPI_DEVICE: "/dev/dri/renderD128" },
        () => true,
      ),
    ).toEqual([]);
  });

  test("builds an NVENC hardware HLS smoke command", () => {
    const args = hardwareHlsSmokeArgs({
      ...SMOKE_INPUT,
      mode: "nvenc",
      env: {},
    });

    expect(args).toContain("-hwaccel");
    expect(args).toContain("cuda");
    expect(args).toContain("h264_nvenc");
    expect(args).toContain("-preset");
    expect(args).toContain("p4");
  });
});
