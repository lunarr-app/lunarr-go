#!/usr/bin/env node

// Diagnostic: probe keyframes for a specific media file in the database.
//
// Usage:
//   node scripts/diagnose-keyframes.mjs <mediaFileId>
//   node scripts/diagnose-keyframes.mjs <mediaFileId> --verbose
//
// Bypasses playback routing to test the keyframe extractors directly
// against a remote (WebDAV/SFTP) file. Reports:
//   - media_file row (container, extension, codecs)
//   - video_stream_info row (stream index, frame rate)
//   - format classification
//   - remote seekable input source setup time
//   - mp4 stss parser result + timing
//   - mkv Cues parser result + timing
//   - combined probeKeyframes result + timing

import { mkdir, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";

await import("dotenv/config");

const mediaFileId = process.argv[2];
const verbose = process.argv.includes("--verbose");

if (!mediaFileId) {
  console.error("Usage: node scripts/diagnose-keyframes.mjs <mediaFileId>");
  process.exit(1);
}

// Lazily import the modules that need the populated environment.
const { getDb, currentDatabasePaths } = await import("../src/lib/server/db/index.ts");
const { getMediaFile } = await import("../src/lib/server/media/files.ts");
const { isRemoteLibrarySource } = await import("../src/lib/server/libraries/source.ts");
const { nodeAvInputFormat } = await import("../src/lib/server/transcoding/container-format.ts");
const { createSeekableStorageInputSource, createSeekableByteRangeReader } =
  await import("../src/lib/server/transcoding/playback-resolve.ts");
const { extractKeyframeTimesFromMp4 } = await import("../src/lib/server/transcoding/mp4-stss.ts");
const { extractKeyframeTimesFromMkv } = await import("../src/lib/server/transcoding/mkv-cues.ts");
const { probeKeyframes } = await import("../src/lib/server/transcoding/keyframe-probe.ts");
const { keyframeScanStrategyForFormat } = await import("../src/lib/server/transcoding/keyframes.ts");

console.log(`Database: ${currentDatabasePaths().main}`);
const db = await getDb();

// Look up media file
const file = await getMediaFile(mediaFileId, "");
if (!file) {
  console.error(`media_file not found: ${mediaFileId}`);
  process.exit(1);
}

console.log("\n--- Media file ---");
console.log(`  id:         ${file.id}`);
console.log(`  path:       ${file.path}`);
console.log(`  basename:   ${file.basename}`);
console.log(`  extension:  ${file.extension}`);
console.log(`  container:  ${file.container}`);
console.log(`  video_codec: ${file.video_codec}`);
console.log(`  audio_codec: ${file.audio_codec}`);
console.log(`  size_bytes: ${file.size_bytes}`);
console.log(`  duration_seconds: ${file.duration_seconds}`);
console.log(`  source:     ${file.source}`);

// Look up video stream
const videoStream = await db
  .selectFrom("media_stream_info")
  .select(["stream_index", "stream_type", "codec_name", "frame_rate", "r_frame_rate", "nb_frames"])
  .where("media_file_id", "=", mediaFileId)
  .where("stream_type", "=", "video")
  .orderBy("stream_index", "asc")
  .limit(1)
  .executeTakeFirst();

console.log("\n--- Video stream ---");
if (!videoStream) {
  console.log("  (no video stream row in media_stream_info)");
} else {
  console.log(`  stream_index: ${videoStream.stream_index}`);
  console.log(`  codec_name:   ${videoStream.codec_name}`);
  console.log(`  frame_rate:    ${videoStream.frame_rate}`);
  console.log(`  r_frame_rate:  ${videoStream.r_frame_rate}`);
  console.log(`  nb_frames:     ${videoStream.nb_frames}`);
}

// Format classification
const format = nodeAvInputFormat(file);
const strategy = keyframeScanStrategyForFormat(format);
console.log("\n--- Format classification ---");
console.log(`  nodeAvInputFormat: ${format ?? "null"}`);
console.log(`  keyframeScanStrategy: ${strategy}`);

if (strategy === "skip") {
  console.log("\nResult: format is not scannable. Falling back to transcode.");
  process.exit(0);
}

// Set up remote input source if needed
const isRemote = isRemoteLibrarySource(file.source);
let inputSource = undefined;
if (isRemote) {
  console.log("\n--- Remote seekable input setup ---");
  const setupStart = performance.now();
  try {
    inputSource = await createSeekableStorageInputSource(file);
    console.log(`  sizeBytes: ${inputSource.sizeBytes}`);
    console.log(`  format:    ${inputSource.format}`);
    console.log(`  Setup took ${(performance.now() - setupStart).toFixed(1)}ms`);
  } catch (err) {
    console.log(`  Setup FAILED: ${err.message}`);
    process.exit(1);
  }
}

// Run mp4 parser directly
console.log("\n--- mp4 stss parser ---");
const mp4Start = performance.now();
try {
  const reader = inputSource
    ? createSeekableByteRangeReader(inputSource)
    : await (await import("../src/lib/server/transcoding/mp4-stss.ts")).createLocalByteRangeReader(file.path);
  try {
    const result = await extractKeyframeTimesFromMp4(reader);
    const elapsed = (performance.now() - mp4Start).toFixed(1);
    if (result === null) {
      console.log(`  Result: null (not a valid mp4 file) [${elapsed}ms]`);
    } else {
      console.log(`  Result: ${result.length} keyframes [${elapsed}ms]`);
      if (verbose || result.length < 20) {
        for (const t of result) console.log(`    ${t.toFixed(3)}s`);
      } else {
        console.log(
          `    first 5: ${result
            .slice(0, 5)
            .map((t) => t.toFixed(3) + "s")
            .join(", ")}`,
        );
        console.log(
          `    last 5:  ${result
            .slice(-5)
            .map((t) => t.toFixed(3) + "s")
            .join(", ")}`,
        );
      }
    }
  } finally {
    await reader.close().catch(() => undefined);
  }
} catch (err) {
  console.log(`  Parser threw: ${err.message} [${(performance.now() - mp4Start).toFixed(1)}ms]`);
}

// Close the input source so the mp4 parser doesn't reuse a closed handle.
// (We re-create it below.)

// Run mkv Cues parser directly (only if inputSource wasn't consumed)
console.log("\n--- mkv Cues parser ---");
const mkvReader = inputSource
  ? createSeekableByteRangeReader(inputSource)
  : await (await import("../src/lib/server/transcoding/mp4-stss.ts")).createLocalByteRangeReader(file.path);
const mkvStart = performance.now();
try {
  const result = await extractKeyframeTimesFromMkv(mkvReader);
  const elapsed = (performance.now() - mkvStart).toFixed(1);
  if (result === null) {
    console.log(`  Result: null (no Cues element found or not a valid mkv) [${elapsed}ms]`);
  } else {
    console.log(`  Result: ${result.length} keyframes [${elapsed}ms]`);
    if (verbose || result.length < 20) {
      for (const t of result) console.log(`    ${t.toFixed(3)}s`);
    } else {
      console.log(
        `    first 5: ${result
          .slice(0, 5)
          .map((t) => t.toFixed(3) + "s")
          .join(", ")}`,
      );
      console.log(
        `    last 5:  ${result
          .slice(-5)
          .map((t) => t.toFixed(3) + "s")
          .join(", ")}`,
      );
    }
  }
} catch (err) {
  console.log(`  Parser threw: ${err.message} [${(performance.now() - mkvStart).toFixed(1)}ms]`);
} finally {
  await mkvReader.close().catch(() => undefined);
}

// Run combined probeKeyframes (what production uses)
console.log("\n--- Combined probeKeyframes (production path) ---");
const combinedStart = performance.now();
try {
  const result = await probeKeyframes({
    mediaFileId: file.id,
    path: file.path,
    inputSource,
    signal: undefined,
  });
  const elapsed = (performance.now() - combinedStart).toFixed(1);
  if (result === null) {
    console.log(`  Result: null [${elapsed}ms]`);
  } else {
    console.log(`  Result: ${result.length} keyframes [${elapsed}ms]`);
  }
} catch (err) {
  console.log(`  Probe threw: ${err.message} [${(performance.now() - combinedStart).toFixed(1)}ms]`);
} finally {
  if (inputSource) await inputSource.close().catch(() => undefined);
}

console.log("\nDone.");
