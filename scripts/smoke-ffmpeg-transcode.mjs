#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HARDWARE_ENCODERS, hardwareModesToVerify, verifyFfmpegPlaybackRequirements } from "./verify-ffmpeg.mjs";

export function runFfmpeg(binaryPath, args) {
  const result = spawnSync(binaryPath, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "FFmpeg command failed.");
  }
}

export function ffmpegFixtureArgs(sourcePath) {
  return [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=640x360:rate=24",
    "-t",
    "3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    sourcePath,
  ];
}

function commonHlsOutputArgs(input) {
  return [
    "-max_muxing_queue_size",
    "2048",
    "-avoid_negative_ts",
    "make_zero",
    "-f",
    "hls",
    "-hls_time",
    "1",
    "-hls_list_size",
    "0",
    "-hls_playlist_type",
    "event",
    "-hls_flags",
    input.hlsFlags ?? "independent_segments+temp_file",
    "-hls_segment_filename",
    input.segmentPattern,
    input.playlistPath,
  ];
}

export function softwareHlsSmokeArgs(input) {
  return [
    "-hide_banner",
    "-y",
    "-i",
    input.sourcePath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-g",
    "30",
    "-keyint_min",
    "30",
    "-sc_threshold",
    "0",
    "-force_key_frames",
    "expr:gte(t,n_forced*1)",
    "-c:a",
    "aac",
    "-ac",
    "2",
    ...commonHlsOutputArgs(input),
  ];
}

export function remuxHlsSmokeArgs(input) {
  return [
    "-hide_banner",
    "-y",
    "-i",
    input.sourcePath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    ...commonHlsOutputArgs({ ...input, hlsFlags: "temp_file" }),
  ];
}

function hardwareInputArgs(mode, env = process.env) {
  switch (mode) {
    case "videotoolbox":
      return ["-hwaccel", "videotoolbox"];
    case "vaapi":
      return ["-vaapi_device", env.FFMPEG_VAAPI_DEVICE || "/dev/dri/renderD128"];
    case "qsv":
      return ["-hwaccel", "qsv"];
    case "nvenc":
      return ["-hwaccel", "cuda"];
    case "amf":
      return [];
    default:
      throw new Error(`Unsupported FFmpeg hardware smoke mode: ${mode}`);
  }
}

export function hardwareRuntimePrerequisiteErrors(mode, env = process.env, existsPath = existsSync) {
  if (mode !== "vaapi") return [];

  const device = env.FFMPEG_VAAPI_DEVICE || "/dev/dri/renderD128";
  if (existsPath(device)) return [];

  return [
    `VAAPI device "${device}" is not available. Mount the host render device into the runtime or set FFMPEG_VAAPI_DEVICE to the mounted render device path.`,
  ];
}

function assertHardwareRuntimePrerequisites(mode, env = process.env) {
  const errors = hardwareRuntimePrerequisiteErrors(mode, env);
  if (errors.length === 0) return;
  throw new Error(errors.join("\n"));
}

function hardwareVideoArgs(mode) {
  const encoder = HARDWARE_ENCODERS[mode];
  const common = ["-b:v", "2M", "-g", "30", "-keyint_min", "30", "-force_key_frames", "expr:gte(t,n_forced*1)"];

  switch (mode) {
    case "videotoolbox":
      return ["-c:v", encoder, ...common];
    case "vaapi":
      return ["-vf", "format=nv12,hwupload", "-c:v", encoder, ...common];
    case "qsv":
      return ["-c:v", encoder, "-preset", "veryfast", ...common];
    case "nvenc":
      return ["-c:v", encoder, "-preset", "p4", ...common];
    case "amf":
      return ["-c:v", encoder, "-quality", "speed", ...common];
    default:
      throw new Error(`Unsupported FFmpeg hardware smoke mode: ${mode}`);
  }
}

export function hardwareHlsSmokeArgs(input) {
  return [
    "-hide_banner",
    "-y",
    ...hardwareInputArgs(input.mode, input.env),
    "-i",
    input.sourcePath,
    "-map",
    "0:v:0",
    "-an",
    "-sn",
    "-dn",
    ...hardwareVideoArgs(input.mode),
    ...commonHlsOutputArgs(input),
  ];
}

export function hardwareSmokeModes(env = process.env, platform = process.platform) {
  return hardwareModesToVerify(env.FFMPEG_SMOKE_HARDWARE, platform, "FFMPEG_SMOKE_HARDWARE");
}

function assertGeneratedSegment(segmentPath) {
  const segment = statSync(segmentPath);
  if (!segment.isFile() || segment.size <= 0) {
    throw new Error("FFmpeg did not generate a non-empty HLS segment.");
  }
}

function assertEventPlaylistContainsSegment(playlistPath, segmentName) {
  const playlist = readFileSync(playlistPath, "utf8");
  if (!playlist.includes("#EXT-X-PLAYLIST-TYPE:EVENT")) {
    throw new Error("FFmpeg did not publish an HLS event playlist.");
  }
  if (!playlist.includes(segmentName)) {
    throw new Error(`FFmpeg did not publish ${segmentName} in the HLS event playlist.`);
  }
  if (!/^#EXTINF:[0-9]+(?:\.[0-9]+)?,/m.test(playlist)) {
    throw new Error("FFmpeg event playlist did not include segment timing.");
  }
}

function smokeArtifactPaths(directory, name) {
  const artifactDirectory = path.join(directory, name);
  mkdirSync(artifactDirectory, { recursive: true });
  return {
    artifactDirectory,
    playlistPath: path.join(artifactDirectory, "master.m3u8"),
    segmentPattern: path.join(artifactDirectory, "segment-%05d.ts"),
    firstSegmentPath: path.join(artifactDirectory, "segment-00000.ts"),
  };
}

export function runSmoke(env = process.env) {
  const ffmpegPath = env.FFMPEG_PATH || "ffmpeg";
  const modes = hardwareSmokeModes(env);
  const requirements = verifyFfmpegPlaybackRequirements({
    env: {
      ...env,
      FFMPEG_VERIFY_HARDWARE: env.FFMPEG_VERIFY_HARDWARE || env.FFMPEG_SMOKE_HARDWARE || "",
    },
  });
  const directory = mkdtempSync(path.join(tmpdir(), "lunarr-ffmpeg-smoke-"));

  try {
    const sourcePath = path.join(directory, "source.mp4");
    runFfmpeg(ffmpegPath, ffmpegFixtureArgs(sourcePath));

    const software = smokeArtifactPaths(directory, "software");
    runFfmpeg(
      ffmpegPath,
      softwareHlsSmokeArgs({
        sourcePath,
        playlistPath: software.playlistPath,
        segmentPattern: software.segmentPattern,
      }),
    );
    assertGeneratedSegment(software.firstSegmentPath);
    assertEventPlaylistContainsSegment(software.playlistPath, "segment-00000.ts");

    const remux = smokeArtifactPaths(directory, "remux");
    runFfmpeg(
      ffmpegPath,
      remuxHlsSmokeArgs({
        sourcePath,
        playlistPath: remux.playlistPath,
        segmentPattern: remux.segmentPattern,
      }),
    );
    assertGeneratedSegment(remux.firstSegmentPath);
    assertEventPlaylistContainsSegment(remux.playlistPath, "segment-00000.ts");

    for (const mode of modes) {
      const hardware = smokeArtifactPaths(directory, `hardware-${mode}`);
      try {
        assertHardwareRuntimePrerequisites(mode, env);
        runFfmpeg(
          ffmpegPath,
          hardwareHlsSmokeArgs({
            mode,
            sourcePath,
            playlistPath: hardware.playlistPath,
            segmentPattern: hardware.segmentPattern,
            env,
          }),
        );
      } catch (error) {
        throw new Error(
          `FFmpeg hardware HLS smoke failed for ${mode}. Verify that the production host exposes the required hardware device/driver to the runtime.\n${error instanceof Error ? error.message : String(error)}`,
        );
      }
      assertGeneratedSegment(hardware.firstSegmentPath);
      assertEventPlaylistContainsSegment(hardware.playlistPath, "segment-00000.ts");
    }

    console.log(requirements.versionLine);
    console.log("FFmpeg local HLS transcode smoke passed.");
    console.log("FFmpeg local HLS copied-remux smoke passed.");
    if (modes.length > 0) {
      console.log(`FFmpeg hardware HLS smoke passed: ${modes.join(", ")}.`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke();
}
