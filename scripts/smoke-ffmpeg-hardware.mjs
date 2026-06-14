#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { runSmoke } from "./smoke-ffmpeg-transcode.mjs";

export function hardwareSmokeEnv(env = process.env) {
  const hardwareMode = env.FFMPEG_SMOKE_HARDWARE || env.FFMPEG_VERIFY_HARDWARE || "auto";
  return {
    ...env,
    FFMPEG_SMOKE_HARDWARE: hardwareMode,
    FFMPEG_VERIFY_HARDWARE: env.FFMPEG_VERIFY_HARDWARE || hardwareMode,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke(hardwareSmokeEnv());
}
