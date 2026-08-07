#!/usr/bin/env node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ffmpegFixtureArgs, runFfmpeg } from "./smoke-ffmpeg-transcode.mjs";
import * as NodeAvApi from "node-av/api";
import * as NodeAvConstants from "node-av/constants";
import * as NodeAvLib from "node-av/lib";

NodeAvLib.Log.setLevel(NodeAvConstants.AV_LOG_QUIET);

export function validateNodeAvProbeSummary(summary) {
  if (!summary || typeof summary !== "object") {
    throw new Error("NodeAV probe did not return a summary.");
  }
  if (!summary.container) {
    throw new Error("NodeAV probe did not report a container.");
  }
  if (!Number.isFinite(summary.durationSeconds) || summary.durationSeconds <= 0) {
    throw new Error("NodeAV probe did not report a positive duration.");
  }
  if (!Number.isSafeInteger(summary.videoStreamCount) || summary.videoStreamCount <= 0) {
    throw new Error("NodeAV probe did not find a video stream.");
  }
}

export async function probeWithNodeAv(sourcePath) {
  let demuxer;
  try {
    demuxer = await NodeAvApi.Demuxer.open(sourcePath);
    const videoStreamCount = demuxer.streams.filter(
      (stream) => stream.codecpar.codecType === NodeAvConstants.AVMEDIA_TYPE_VIDEO,
    ).length;
    const durationSeconds = Number.isFinite(demuxer.duration) && demuxer.duration > 0 ? demuxer.duration : null;
    const summary = {
      container: demuxer.formatName === "unknown" ? null : demuxer.formatName,
      durationSeconds,
      videoStreamCount,
    };
    validateNodeAvProbeSummary(summary);
    return summary;
  } finally {
    await demuxer?.close();
  }
}

export async function runNodeAvProbeVerification(env = process.env) {
  const ffmpegPath = env.FFMPEG_PATH || "ffmpeg";
  const directory = mkdtempSync(path.join(tmpdir(), "lunarr-nodeav-probe-"));

  try {
    const sourcePath = path.join(directory, "source.mp4");
    runFfmpeg(ffmpegPath, ffmpegFixtureArgs(sourcePath));
    const summary = await probeWithNodeAv(sourcePath);
    console.log(
      `NodeAV probe verified: ${summary.container}, ${summary.videoStreamCount} video stream(s), ${summary.durationSeconds.toFixed(3)}s.`,
    );
    return summary;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runNodeAvProbeVerification();
}
