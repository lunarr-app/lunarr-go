#!/usr/bin/env node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runFfmpeg } from "./smoke-ffmpeg-transcode.mjs";
import { createLocalByteRangeReader } from "../src/lib/server/transcoding/mp4-stss.ts";
import { extractKeyframeTimesFromMkv } from "../src/lib/server/transcoding/mkv-cues.ts";

async function main() {
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  const directory = mkdtempSync(path.join(tmpdir(), "lunarr-mkv-keyframes-"));
  try {
    const sourcePath = path.join(directory, "source.mkv");
    // Generate a 10s mkv with 2s GOP (= 5 keyframes at 0,2,4,6,8s)
    runFfmpeg(ffmpegPath, [
      "-hide_banner",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=640x360:rate=24",
      "-t",
      "10",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "48", // GOP size 48 frames @ 24fps = 2s
      sourcePath,
    ]);

    const reader = await createLocalByteRangeReader(sourcePath);
    try {
      const keyframes = await extractKeyframeTimesFromMkv(reader);
      if (!keyframes || keyframes.length === 0) {
        throw new Error(`Expected keyframes, got: ${JSON.stringify(keyframes)}`);
      }
      console.log(`Extracted ${keyframes.length} keyframes:`);
      for (const t of keyframes) {
        console.log(`  ${t.toFixed(3)}s`);
      }
      if (keyframes[0] > 0.5) {
        throw new Error(`First keyframe should be near 0, got ${keyframes[0]}`);
      }
      if (keyframes.length < 3) {
        throw new Error(`Expected at least 3 keyframes for 10s @ 2s GOP, got ${keyframes.length}`);
      }
      // Check spacing is roughly 2s
      for (let i = 1; i < keyframes.length; i++) {
        const gap = keyframes[i] - keyframes[i - 1];
        if (Math.abs(gap - 2.0) > 0.1) {
          throw new Error(`Keyframe gap ${i}: expected ~2.0s, got ${gap.toFixed(3)}s`);
        }
      }
      console.log("mkv-cues parser verified OK");
    } finally {
      await reader.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
