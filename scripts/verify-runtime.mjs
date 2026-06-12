#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { verifyFfmpegPlaybackRequirements } from "./verify-ffmpeg.mjs";
import { runSmoke } from "./smoke-ffmpeg-transcode.mjs";
import { runNodeAvProbeVerification } from "./verify-nodeav-probe.mjs";

export function runtimeVerificationEnv(env = process.env) {
  const hardwareMode =
    env.FFMPEG_SMOKE_HARDWARE || env.LUNARR_VERIFY_HARDWARE || "";
  if (!hardwareMode) return env;

  return {
    ...env,
    FFMPEG_SMOKE_HARDWARE: hardwareMode,
    FFMPEG_VERIFY_HARDWARE: env.FFMPEG_VERIFY_HARDWARE || hardwareMode,
  };
}

export async function runRuntimeVerification(
  env = process.env,
  dependencies = {},
) {
  const effectiveEnv = runtimeVerificationEnv(env);
  const log = dependencies.log ?? console.log;
  const verifyFfmpeg =
    dependencies.verifyFfmpeg ?? verifyFfmpegPlaybackRequirements;
  const smokeFfmpeg = dependencies.smokeFfmpeg ?? runSmoke;
  const verifyNodeAv =
    dependencies.verifyNodeAv ?? runNodeAvProbeVerification;

  const ffmpeg = verifyFfmpeg({ env: effectiveEnv });
  log(ffmpeg.versionLine);
  log("FFmpeg playback requirements verified.");
  if (ffmpeg.hardwareEncoders.length > 0) {
    log(
      `FFmpeg hardware playback encoders verified: ${ffmpeg.hardwareEncoders.join(", ")}.`,
    );
  }

  smokeFfmpeg(effectiveEnv);
  await verifyNodeAv(effectiveEnv);
  log("Lunarr playback runtime verification passed.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runRuntimeVerification();
}
