#!/usr/bin/env node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runFfmpeg, ffmpegFixtureArgs } from "./smoke-ffmpeg-transcode.mjs";
import { createLocalByteRangeReader, extractKeyframeTimesFromMp4 } from "../src/lib/server/transcoding/mp4-stss.ts";

async function main() {
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  const directory = mkdtempSync(path.join(tmpdir(), "lunarr-mp4-keyframes-"));
  try {
    const sourcePath = path.join(directory, "source.mp4");
    // Use longer duration + GOP size to produce multiple keyframes.
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
      "-movflags",
      "+faststart",
      sourcePath,
    ]);

    const reader = await createLocalByteRangeReader(sourcePath);
    try {
      const keyframes = await extractKeyframeTimesFromMp4(reader);
      if (!keyframes || keyframes.length === 0) {
        throw new Error(`Expected keyframes, got: ${JSON.stringify(keyframes)}`);
      }
      console.log(`Extracted ${keyframes.length} keyframes:`);
      for (const t of keyframes) {
        console.log(`  ${t.toFixed(3)}s`);
      }
      // Expect first keyframe near 0 and subsequent ~2s apart.
      if (keyframes[0] > 0.5) {
        throw new Error(`First keyframe should be near 0, got ${keyframes[0]}`);
      }
      if (keyframes.length < 3) {
        throw new Error(`Expected at least 3 keyframes for 10s @ 2s GOP, got ${keyframes.length}`);
      }
      console.log("mp4-stss parser verified OK");
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
