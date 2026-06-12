#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const HARDWARE_ENCODERS = {
  videotoolbox: "h264_videotoolbox",
  vaapi: "h264_vaapi",
  qsv: "h264_qsv",
  nvenc: "h264_nvenc",
  amf: "h264_amf",
};

export function defaultHardwareMode(platform = process.platform) {
  if (platform === "darwin") return "videotoolbox";
  if (platform === "win32") return "qsv";
  return "vaapi";
}

function encoderPattern(encoder) {
  return new RegExp(
    `^\\s*V\\S*\\s+${encoder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "m",
  );
}

function runFfmpeg(binaryPath, args) {
  const result = spawnSync(binaryPath, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (result.error) {
    throw new Error(
      `Unable to execute FFmpeg at "${binaryPath}": ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `FFmpeg command failed (${binaryPath} ${args.join(" ")}):\n${output}`,
    );
  }
  return output;
}

function requirePattern(label, output, pattern) {
  if (pattern.test(output)) return;
  throw new Error(`FFmpeg is missing required ${label}.`);
}

export function hardwareModesToVerify(
  value,
  platform = process.platform,
  label = "FFMPEG_VERIFY_HARDWARE",
) {
  if (!value?.trim()) return [];
  const modes = value
    .split(",")
    .map((mode) => mode.trim().toLowerCase())
    .filter(Boolean);
  const resolved = modes.map((mode) =>
    mode === "auto" ? defaultHardwareMode(platform) : mode,
  );
  const unique = [...new Set(resolved)];
  for (const mode of unique) {
    if (!(mode in HARDWARE_ENCODERS)) {
      throw new Error(
        `Unsupported ${label} mode "${mode}". Supported values: auto, ${Object.keys(HARDWARE_ENCODERS).join(", ")}.`,
      );
    }
  }
  return unique;
}

export function verifyFfmpegOutputs(input) {
  requirePattern("HLS muxer", input.muxersOutput, /^\s*E\s+hls\b/m);
  requirePattern(
    "libx264 encoder",
    input.encodersOutput,
    encoderPattern("libx264"),
  );
  requirePattern("AAC encoder", input.encodersOutput, /^\s*A\S*\s+aac\b/m);

  for (const mode of input.hardwareModes ?? []) {
    const encoder = HARDWARE_ENCODERS[mode];
    requirePattern(
      `${mode} H.264 encoder (${encoder})`,
      input.encodersOutput,
      encoderPattern(encoder),
    );
  }
}

export function verifyFfmpegPlaybackRequirements(options = {}) {
  const env = options.env ?? process.env;
  const ffmpegPath = env.FFMPEG_PATH || "ffmpeg";
  const platform = options.platform ?? process.platform;
  const run = options.run ?? ((args) => runFfmpeg(ffmpegPath, args));
  const hardwareModes = hardwareModesToVerify(
    env.FFMPEG_VERIFY_HARDWARE,
    platform,
  );

  const versionOutput = run(["-hide_banner", "-version"]);
  const muxersOutput = run(["-hide_banner", "-muxers"]);
  const encodersOutput = run(["-hide_banner", "-encoders"]);

  verifyFfmpegOutputs({ muxersOutput, encodersOutput, hardwareModes });

  const versionLine = versionOutput.split(/\r?\n/).find(Boolean) ?? "ffmpeg";
  return {
    versionLine,
    hardwareModes,
    hardwareEncoders: hardwareModes.map((mode) => HARDWARE_ENCODERS[mode]),
  };
}

function isMainModule() {
  return process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;
}

if (isMainModule()) {
  const result = verifyFfmpegPlaybackRequirements();
  console.log(result.versionLine);
  console.log(
    "FFmpeg playback requirements verified: hls muxer, libx264, aac.",
  );
  if (result.hardwareModes.length > 0) {
    console.log(
      `FFmpeg hardware playback encoders verified: ${result.hardwareEncoders.join(", ")}.`,
    );
  }
}
