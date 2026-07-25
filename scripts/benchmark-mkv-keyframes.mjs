#!/usr/bin/env node

// Benchmark: node-av packet iteration vs custom HTTP range Cues parser
// for extracting keyframe timestamps from Matroska (.mkv) files.
//
// Usage:
//   node scripts/benchmark-mkv-keyframes.mjs [durationSeconds] [gopSize]
//
// Default: 10s video with 48-frame GOP (2s keyframe interval at 24fps).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runFfmpeg } from "./smoke-ffmpeg-transcode.mjs";
import { createLocalByteRangeReader } from "../src/lib/server/transcoding/mp4-stss.ts";
import { extractKeyframeTimesFromMkv } from "../src/lib/server/transcoding/mkv-cues.ts";

const durationSeconds = Number(process.argv[2] ?? 10);
const gopSize = Number(process.argv[3] ?? 48);

async function loadNodeAv() {
  const [api, constants, lib] = await Promise.all([
    import("node-av/api"),
    import("node-av/constants"),
    import("node-av/lib"),
  ]);
  lib.Log.setLevel(constants.AV_LOG_QUIET);
  return { api, constants };
}

async function nodeAvProbeKeyframes(sourcePath, signal) {
  const modules = await loadNodeAv();
  const demuxer = await modules.api.Demuxer.open(sourcePath);
  try {
    const videoStream = demuxer.streams.find((s) => s.codecpar.codecType === modules.constants.AVMEDIA_TYPE_VIDEO);
    if (!videoStream) return null;
    const timeBase = videoStream.timeBase;
    if (!timeBase || timeBase.den === 0) return null;

    const noPtsValue = modules.constants.AV_NOPTS_VALUE;
    const keyframeTimes = [];
    const packets = demuxer.packets(videoStream.index);
    while (true) {
      const next = await packets.next();
      if (next.done) break;
      const packet = next.value;
      if (!packet) continue;
      try {
        if (packet.isKeyframe) {
          const pts = packet.pts;
          if (pts !== noPtsValue) {
            const seconds = Number(pts) * (timeBase.num / timeBase.den);
            if (Number.isFinite(seconds) && seconds >= 0) {
              keyframeTimes.push(seconds);
            }
          }
        }
      } finally {
        packet.free();
      }
    }
    await packets.return?.(undefined).catch(() => undefined);
    return keyframeTimes.length > 0 ? keyframeTimes : null;
  } finally {
    await demuxer?.close().catch(() => undefined);
  }
}

async function main() {
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  const directory = mkdtempSync(path.join(tmpdir(), "lunarr-mkv-bench-"));
  try {
    const sourcePath = path.join(directory, "source.mkv");
    console.log(`Generating ${durationSeconds}s mkv (GOP=${gopSize}, 24fps)...`);
    runFfmpeg(ffmpegPath, [
      "-hide_banner",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=640x360:rate=24`,
      "-t",
      String(durationSeconds),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-g",
      String(gopSize),
      sourcePath,
    ]);

    // --- Custom parser ---
    console.log("\n--- Custom HTTP range Cues parser ---");
    const customStart = performance.now();
    const reader = await createLocalByteRangeReader(sourcePath);
    let customKeyframes;
    try {
      customKeyframes = await extractKeyframeTimesFromMkv(reader);
    } finally {
      await reader.close();
    }
    const customEnd = performance.now();
    const customMs = (customEnd - customStart).toFixed(1);
    console.log(`Time: ${customMs}ms`);
    console.log(`Keyframes (${customKeyframes?.length ?? 0}):`);
    if (customKeyframes) {
      for (const t of customKeyframes) console.log(`  ${t.toFixed(3)}s`);
    }

    // --- node-av parser ---
    console.log("\n--- node-av packet iteration ---");
    const nodeAvStart = performance.now();
    let nodeAvKeyframes;
    try {
      nodeAvKeyframes = await nodeAvProbeKeyframes(sourcePath);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
    const nodeAvEnd = performance.now();
    const nodeAvMs = (nodeAvEnd - nodeAvStart).toFixed(1);
    console.log(`Time: ${nodeAvMs}ms`);
    console.log(`Keyframes (${nodeAvKeyframes?.length ?? 0}):`);
    if (nodeAvKeyframes) {
      for (const t of nodeAvKeyframes) console.log(`  ${t.toFixed(3)}s`);
    }

    // --- Comparison ---
    console.log("\n--- Comparison ---");
    console.log(`Custom:  ${customMs}ms, ${customKeyframes?.length ?? 0} keyframes`);
    console.log(`node-av: ${nodeAvMs}ms, ${nodeAvKeyframes?.length ?? 0} keyframes`);
    const ratio = (Number(nodeAvMs) / Number(customMs)).toFixed(1);
    console.log(`node-av is ${ratio}x slower`);

    if (customKeyframes && nodeAvKeyframes) {
      if (customKeyframes.length === nodeAvKeyframes.length) {
        let maxDiff = 0;
        for (let i = 0; i < customKeyframes.length; i++) {
          maxDiff = Math.max(maxDiff, Math.abs(customKeyframes[i] - nodeAvKeyframes[i]));
        }
        console.log(`Max timestamp difference: ${maxDiff.toFixed(6)}s`);
        if (maxDiff < 0.01) {
          console.log("Results match ✓");
        } else {
          console.log("WARNING: timestamps differ by more than 10ms");
        }
      } else {
        console.log("WARNING: keyframe count mismatch");
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
