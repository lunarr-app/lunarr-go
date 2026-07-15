import type {
  HlsSegmentWindowGeneration,
  HlsSegmentWindowTranscodeInput,
  HlsTranscodeInput,
  TranscodeBackend,
} from "./backend";
import { startSeekableInputProxy, type RunningSeekableInputProxy } from "./input-proxy";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { ffmpegPath } from "node-av/ffmpeg";
import { encodeEventPlaylistPath, encodeFmp4InitFileName, encodeJobId } from "./encode-coordinator";
import { hlsEventPlaylistHasSegment, resolveEncodeAheadSegmentCount, type HlsSegmentFormat } from "./hls";

const STDERR_MAX_BYTES = 32 * 1024;
const SEGMENT_POLL_MS = 50;
const FFMPEG_FORCE_KILL_GRACE_MS = 2_500;
const DEFAULT_HARDWARE_BITRATE = "5M";
const DEFAULT_SOFTWARE_CRF = 23;

type ActiveFfmpeg = {
  process: ChildProcess;
  completion: Promise<void>;
  inputProxy?: RunningSeekableInputProxy;
};

type FfmpegHardwareMode = "videotoolbox" | "vaapi" | "qsv" | "nvenc" | "amf";
type FfmpegHlsOptions = {
  inputUrl?: string;
  startSegmentNumber?: number;
  maxOutputSeconds?: number;
};
type ActiveHlsStream = {
  active: ActiveFfmpeg;
  artifactDirectory: string;
  eventPlaylistPath: string;
  inputPath: string;
  inputSourceKey: string | null;
  mode: HlsTranscodeInput["mode"];
  segmentSeconds: number;
  hardwareAcceleration: HlsTranscodeInput["hardwareAcceleration"];
  hardwareAccelerationRequired: boolean;
  transcodeQualityKey: string;
  hlsSegmentFormat: HlsSegmentFormat;
  startSegmentIndex: number;
  generatedSegmentCount: number;
};

const activeFfmpeg = new Map<string, Set<ActiveFfmpeg>>();
const activeHlsStreams = new Map<string, ActiveHlsStream>();

class FfmpegBackendError extends Error {}

type KillableProcess = Pick<ChildProcess, "exitCode" | "signalCode" | "kill">;

function hlsPlaylistPath(artifactDirectory: string) {
  return path.join(artifactDirectory, "master.m3u8");
}

function hlsSegmentPattern(artifactDirectory: string, segmentFormat: HlsSegmentFormat) {
  const extension = segmentFormat === "fmp4" ? "m4s" : "ts";
  return path.join(artifactDirectory, `segment-%05d.${extension}`);
}

function canExecuteFfmpeg(binaryPath: string) {
  const result = spawnSync(binaryPath, ["-version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function isProcessStillRunning(process: KillableProcess) {
  return process.exitCode === null && process.signalCode === null;
}

function killIfRunning(process: KillableProcess, signal: NodeJS.Signals) {
  if (!isProcessStillRunning(process)) return false;
  return process.kill(signal);
}

export function scheduleForceKill(process: KillableProcess, graceMs = FFMPEG_FORCE_KILL_GRACE_MS) {
  killIfRunning(process, "SIGTERM");
  return setTimeout(
    () => {
      killIfRunning(process, "SIGKILL");
    },
    Math.max(0, graceMs),
  );
}

async function terminateActiveFfmpeg(active: ActiveFfmpeg) {
  const forceKill = scheduleForceKill(active.process);
  try {
    await active.completion.catch(() => undefined);
  } finally {
    clearTimeout(forceKill);
  }
}

export function resolveFfmpegPath(
  input: {
    configuredPath?: string | null;
    bundledPath?: string | null;
    systemPath?: string;
    canExecute?: (binaryPath: string) => boolean;
  } = {},
) {
  const configuredPath =
    input.configuredPath === undefined ? process.env.FFMPEG_PATH?.trim() : input.configuredPath?.trim();
  if (configuredPath) return configuredPath;

  const canExecute = input.canExecute ?? canExecuteFfmpeg;
  const systemPath = input.systemPath ?? "ffmpeg";
  if (canExecute(systemPath)) return systemPath;

  const bundledPath = input.bundledPath === undefined ? ffmpegPath() : input.bundledPath;
  if (bundledPath && canExecute(bundledPath)) return bundledPath;

  return systemPath;
}

export function resolvedFfmpegPath() {
  return resolveFfmpegPath();
}

function isFfmpegCliAvailable() {
  return canExecuteFfmpeg(resolvedFfmpegPath());
}

function inputPathForFfmpeg(input: Pick<HlsTranscodeInput, "inputPath" | "inputSource">, options?: FfmpegHlsOptions) {
  if (input.inputSource && !options?.inputUrl) {
    throw new FfmpegBackendError("FFmpeg input proxy URL is missing.");
  }
  if (options?.inputUrl) return options.inputUrl;
  return input.inputPath;
}

function audioMapArg(input: HlsTranscodeInput) {
  if (Number.isSafeInteger(input.audioStreamIndex) && Number(input.audioStreamIndex) >= 0) {
    return `0:${input.audioStreamIndex}?`;
  }
  return "0:a:0?";
}

function roundedSegmentFrames(segmentSeconds: number) {
  return Math.max(1, Math.round(segmentSeconds * 30));
}

function maxHeightScaleFilter(maxHeight: number | null | undefined) {
  if (!Number.isSafeInteger(maxHeight) || Number(maxHeight) <= 0) return null;
  return `scale=-2:trunc(min(ih\\,${Number(maxHeight)})/2)*2`;
}

function hardwareScaleArg(mode: FfmpegHardwareMode, maxHeight: number | null | undefined) {
  const scale = maxHeightScaleFilter(maxHeight);
  if (!scale) return [];
  const expr = scale.slice(scale.indexOf("=") + 1);
  const filterName =
    mode === "videotoolbox"
      ? "scale_vt"
      : mode === "qsv"
        ? "scale_qsv"
        : mode === "nvenc"
          ? "scale_cuda"
          : mode === "vaapi"
            ? "scale_vaapi"
            : "scale";
  return ["-vf", `${filterName}=${expr}`];
}

function transcodeQualityKey(input: HlsTranscodeInput) {
  const quality = input.transcodeQuality;
  if (!quality) return "";
  return [quality.preset, quality.maxHeight ?? "", quality.softwareCrf, quality.hardwareBitrate].join(":");
}

function hlsSegmentFormat(input: HlsTranscodeInput): HlsSegmentFormat {
  return input.hlsSegmentFormat === "fmp4" ? "fmp4" : "mpegts";
}

function automaticHardwareMode(required: boolean): FfmpegHardwareMode | null {
  if (!required) return null;
  if (process.platform === "darwin") return "videotoolbox";
  if (process.platform === "win32") return "qsv";
  return "vaapi";
}

function effectiveHardwareMode(input: HlsTranscodeInput) {
  if (input.mode === "remux") return null;
  switch (input.hardwareAcceleration) {
    case "off":
      return null;
    case "auto":
      return automaticHardwareMode(input.hardwareAccelerationRequired);
    case "videotoolbox":
    case "vaapi":
    case "qsv":
    case "nvenc":
    case "amf":
      return input.hardwareAcceleration;
  }
}

function hardwareInputArgs(mode: FfmpegHardwareMode) {
  switch (mode) {
    case "videotoolbox":
      return ["-hwaccel", "videotoolbox", "-hwaccel_output_format", "videotoolbox_vld"];
    case "vaapi":
      return [
        "-hwaccel",
        "vaapi",
        "-hwaccel_output_format",
        "vaapi",
        "-vaapi_device",
        process.env.FFMPEG_VAAPI_DEVICE || "/dev/dri/renderD128",
      ];
    case "qsv":
      return ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"];
    case "nvenc":
      return ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"];
    case "amf":
      return [];
  }
}

function hardwareVideoArgs(input: {
  mode: FfmpegHardwareMode;
  gopSize: number;
  segmentSeconds: number;
  bitrate: string;
  maxHeight?: number | null;
}) {
  const common = [
    "-b:v",
    input.bitrate,
    "-g",
    String(input.gopSize),
    "-keyint_min",
    String(input.gopSize),
    "-force_key_frames",
    `expr:gte(t,n_forced*${input.segmentSeconds})`,
  ];

  switch (input.mode) {
    case "videotoolbox":
      return [
        ...hardwareScaleArg("videotoolbox", input.maxHeight),
        "-c:v",
        "h264_videotoolbox",
        ...common,
      ];
    case "vaapi":
      return [
        ...hardwareScaleArg("vaapi", input.maxHeight),
        "-c:v",
        "h264_vaapi",
        ...common,
      ];
    case "qsv":
      return [
        ...hardwareScaleArg("qsv", input.maxHeight),
        "-c:v",
        "h264_qsv",
        "-preset",
        "veryfast",
        ...common,
      ];
    case "nvenc":
      return [
        ...hardwareScaleArg("nvenc", input.maxHeight),
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p4",
        ...common,
      ];
    case "amf":
      return [
        ...(maxHeightScaleFilter(input.maxHeight) ? ["-vf", maxHeightScaleFilter(input.maxHeight) as string] : []),
        "-c:v",
        "h264_amf",
        "-quality",
        "speed",
        ...common,
      ];
  }
}

function softwareVideoArgs(input: { gopSize: number; segmentSeconds: number; crf: number; maxHeight?: number | null }) {
  return [
    ...(maxHeightScaleFilter(input.maxHeight) ? ["-vf", maxHeightScaleFilter(input.maxHeight) as string] : []),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(input.crf),
    "-pix_fmt",
    "yuv420p",
    "-g",
    String(input.gopSize),
    "-keyint_min",
    String(input.gopSize),
    "-sc_threshold",
    "0",
    "-force_key_frames",
    `expr:gte(t,n_forced*${input.segmentSeconds})`,
  ];
}

export function ffmpegHlsArgs(input: HlsTranscodeInput, options?: FfmpegHlsOptions) {
  const segmentSeconds = Math.max(1, input.segmentSeconds);
  const segmentFormat = hlsSegmentFormat(input);
  const startSegmentNumber = options?.startSegmentNumber;
  const playlistPath =
    startSegmentNumber !== undefined && Number.isSafeInteger(startSegmentNumber) && input.sessionId
      ? encodeEventPlaylistPath(input.artifactDirectory, input.sessionId, startSegmentNumber)
      : hlsPlaylistPath(input.artifactDirectory);
  const args = ["-hide_banner", "-y"];
  const hardwareMode = effectiveHardwareMode(input);
  if (hardwareMode) args.push(...hardwareInputArgs(hardwareMode));
  const startTimeSeconds = Number(input.startTimeSeconds ?? 0);
  if (Number.isFinite(startTimeSeconds) && startTimeSeconds > 0) {
    args.push("-ss", String(startTimeSeconds));
  }

  args.push("-i", inputPathForFfmpeg(input, options));
  if (options?.maxOutputSeconds && options.maxOutputSeconds > 0) {
    args.push("-t", String(options.maxOutputSeconds));
  }
  args.push("-map", "0:v:0", "-map", audioMapArg(input), "-sn", "-dn");

  if (input.mode === "remux") {
    args.push("-c:v", "copy", "-c:a", "copy");
  } else {
    const gopSize = roundedSegmentFrames(segmentSeconds);
    const quality = input.transcodeQuality;
    args.push(
      ...(hardwareMode
        ? hardwareVideoArgs({
            mode: hardwareMode,
            gopSize,
            segmentSeconds,
            bitrate: quality?.hardwareBitrate ?? DEFAULT_HARDWARE_BITRATE,
            maxHeight: quality?.maxHeight,
          })
        : softwareVideoArgs({
            gopSize,
            segmentSeconds,
            crf: quality?.softwareCrf ?? DEFAULT_SOFTWARE_CRF,
            maxHeight: quality?.maxHeight,
          })),
      "-c:a",
      "aac",
      "-ac",
      "2",
    );
  }

  args.push(
    "-max_muxing_queue_size",
    "2048",
    "-avoid_negative_ts",
    "make_zero",
    "-f",
    "hls",
    "-hls_time",
    String(segmentSeconds),
    "-hls_list_size",
    "0",
    "-hls_playlist_type",
    "event",
    "-hls_flags",
    input.mode === "remux" ? "temp_file" : "independent_segments+temp_file",
  );
  if (segmentFormat === "fmp4") {
    const initFileName =
      startSegmentNumber !== undefined && Number.isSafeInteger(startSegmentNumber) && input.sessionId
        ? encodeFmp4InitFileName(input.sessionId, startSegmentNumber)
        : "init.mp4";
    args.push("-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", initFileName);
  }
  if (Number.isSafeInteger(startSegmentNumber)) {
    args.push("-start_number", String(startSegmentNumber));
  }
  args.push("-hls_segment_filename", hlsSegmentPattern(input.artifactDirectory, segmentFormat), playlistPath);

  return args;
}

function ffmpegUnavailableMessage() {
  return "FFmpeg binary is not available. Set FFMPEG_PATH, install ffmpeg on PATH, reinstall node-av, or configure the Docker image with FFmpeg support.";
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new FfmpegBackendError("FFmpeg playback was cancelled.");
}

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new FfmpegBackendError("FFmpeg playback was cancelled."));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timeout);
      reject(new FfmpegBackendError("FFmpeg playback was cancelled."));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function positiveFileSize(filePath: string) {
  try {
    const details = await stat(filePath);
    return details.isFile() && details.size > 0 ? details.size : 0;
  } catch {
    return 0;
  }
}

async function waitForSegmentFile(input: {
  segmentPath: string;
  completion: Promise<void>;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  const deadline = Date.now() + (input.timeoutMs ?? 60_000);
  let completed = false;
  input.completion
    .then(() => {
      completed = true;
    })
    .catch(() => {
      completed = true;
    });

  while (Date.now() <= deadline) {
    throwIfCancelled(input.signal);
    if ((await positiveFileSize(input.segmentPath)) > 0) return;
    if (completed) break;
    await delay(SEGMENT_POLL_MS, input.signal);
  }

  await input.completion.catch((error) => {
    throw error;
  });
  throw new FfmpegBackendError(`FFmpeg did not produce ${path.basename(input.segmentPath)}.`);
}

async function waitForEventPlaylistSegment(input: {
  playlistPath: string;
  segment: string;
  completion: Promise<void>;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  const deadline = Date.now() + (input.timeoutMs ?? 60_000);
  let completed = false;
  input.completion
    .then(() => {
      completed = true;
    })
    .catch(() => {
      completed = true;
    });

  while (Date.now() <= deadline) {
    throwIfCancelled(input.signal);
    if (
      await hlsEventPlaylistHasSegment(input.playlistPath, input.segment, {
        signal: input.signal,
      })
    ) {
      return;
    }
    if (completed) break;
    await delay(SEGMENT_POLL_MS, input.signal);
  }

  await input.completion.catch((error) => {
    throw error;
  });
  throw new FfmpegBackendError(`FFmpeg did not publish ${input.segment} in the HLS event playlist.`);
}

async function runFfmpeg(input: HlsTranscodeInput, options?: FfmpegHlsOptions): Promise<ActiveFfmpeg> {
  throwIfCancelled(input.signal);
  if (!isFfmpegCliAvailable()) {
    throw new FfmpegBackendError(ffmpegUnavailableMessage());
  }

  const inputProxy = input.inputSource
    ? await startSeekableInputProxy({
        sessionId: input.sessionId,
        inputSource: input.inputSource,
        signal: input.signal,
      })
    : undefined;
  const args = ffmpegHlsArgs(input, {
    ...options,
    inputUrl: inputProxy?.url ?? options?.inputUrl,
  });
  const child = spawn(resolvedFfmpegPath(), args, {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  let abortForceKill: ReturnType<typeof setTimeout> | null = null;
  const abort = () => {
    abortForceKill ??= scheduleForceKill(child);
  };
  input.signal?.addEventListener("abort", abort, { once: true });

  child.stderr.on("data", (chunk) => {
    stderr += Buffer.from(chunk).toString("utf8");
    if (stderr.length > STDERR_MAX_BYTES) {
      stderr = stderr.slice(-STDERR_MAX_BYTES);
    }
  });

  const completion = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      input.signal?.removeEventListener("abort", abort);
      if (abortForceKill) {
        clearTimeout(abortForceKill);
        abortForceKill = null;
      }
      void inputProxy?.close().catch(() => undefined);
      if (input.signal?.aborted) {
        resolve();
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new FfmpegBackendError(`FFmpeg exited with ${signal ?? `code ${code}`}.${stderr ? `\n${stderr.trim()}` : ""}`),
      );
    });
  });

  const active = { process: child, completion, inputProxy };
  const entries = activeFfmpeg.get(input.sessionId) ?? new Set<ActiveFfmpeg>();
  entries.add(active);
  activeFfmpeg.set(input.sessionId, entries);
  completion
    .finally(() => {
      entries.delete(active);
      if (entries.size === 0) activeFfmpeg.delete(input.sessionId);
    })
    .catch(() => undefined);
  return active;
}

function inputSourceKey(input: HlsSegmentWindowTranscodeInput) {
  if (!input.inputSource) return null;
  return [
    input.inputSource.kind,
    input.inputSource.label,
    input.inputSource.sizeBytes,
    input.inputSource.format ?? "",
  ].join("\0");
}

function reusableHlsStream(input: HlsSegmentWindowTranscodeInput, firstSegment: { segmentIndex: number }) {
  const prefix = `${input.sessionId}\0`;
  for (const [jobKey, stream] of activeHlsStreams) {
    if (!jobKey.startsWith(prefix)) continue;
    if (stream.artifactDirectory !== input.artifactDirectory) continue;
    if (stream.inputPath !== input.inputPath) continue;
    if (stream.inputSourceKey !== inputSourceKey(input)) continue;
    if (stream.mode !== input.mode) continue;
    if (stream.segmentSeconds !== input.segmentSeconds) continue;
    if (stream.hardwareAcceleration !== input.hardwareAcceleration) continue;
    if (stream.hardwareAccelerationRequired !== input.hardwareAccelerationRequired) continue;
    if (stream.transcodeQualityKey !== transcodeQualityKey(input)) continue;
    if (stream.hlsSegmentFormat !== hlsSegmentFormat(input)) continue;
    if (firstSegment.segmentIndex < stream.startSegmentIndex) continue;
    if (firstSegment.segmentIndex >= stream.startSegmentIndex + stream.generatedSegmentCount) continue;
    return stream;
  }
  return null;
}

async function startHlsStream(
  input: HlsSegmentWindowTranscodeInput,
  firstSegment: { segmentIndex: number; segmentStartSeconds: number },
) {
  await mkdir(input.artifactDirectory, { recursive: true });
  const ahead = resolveEncodeAheadSegmentCount(input.encodeAheadSegmentCount);
  const active = await runFfmpeg(
    {
      ...input,
      startTimeSeconds: firstSegment.segmentStartSeconds,
    },
    {
      startSegmentNumber: firstSegment.segmentIndex,
      maxOutputSeconds: input.segmentSeconds * ahead,
    },
  );
  const stream: ActiveHlsStream = {
    active,
    artifactDirectory: input.artifactDirectory,
    eventPlaylistPath: encodeEventPlaylistPath(input.artifactDirectory, input.sessionId, firstSegment.segmentIndex),
    inputPath: input.inputPath,
    inputSourceKey: inputSourceKey(input),
    mode: input.mode,
    segmentSeconds: input.segmentSeconds,
    hardwareAcceleration: input.hardwareAcceleration,
    hardwareAccelerationRequired: input.hardwareAccelerationRequired,
    transcodeQualityKey: transcodeQualityKey(input),
    hlsSegmentFormat: hlsSegmentFormat(input),
    startSegmentIndex: firstSegment.segmentIndex,
    generatedSegmentCount: ahead,
  };
  const jobKey = encodeJobId(input.sessionId, firstSegment.segmentIndex);
  activeHlsStreams.set(jobKey, stream);
  active.completion
    .finally(() => {
      if (activeHlsStreams.get(jobKey) === stream) {
        activeHlsStreams.delete(jobKey);
      }
    })
    .catch(() => undefined);
  return stream;
}

async function generateStreamingFfmpegWindow(
  input: HlsSegmentWindowTranscodeInput,
): Promise<HlsSegmentWindowGeneration> {
  const requestedSegments = input.segments.filter((segment) => segment.segmentSeconds > 0);
  const firstSegment = requestedSegments[0];
  if (!firstSegment) return { completion: Promise.resolve() };

  let stream = reusableHlsStream(input, firstSegment);
  let unusedInputSourceClosed = false;
  if (!stream) {
    stream = await startHlsStream(input, firstSegment);
  } else if (input.inputSource) {
    await input.inputSource.close().catch(() => undefined);
    unusedInputSourceClosed = true;
  }

  await waitForSegmentFile({
    segmentPath: path.join(input.artifactDirectory, firstSegment.segment),
    completion: stream.active.completion,
    signal: input.signal,
    timeoutMs: input.segmentGenerationTimeoutMs,
  });
  await waitForEventPlaylistSegment({
    playlistPath: stream.eventPlaylistPath,
    segment: firstSegment.segment,
    completion: stream.active.completion,
    signal: input.signal,
    timeoutMs: input.segmentGenerationTimeoutMs,
  });

  return {
    completion: stream.active.completion,
    ...(unusedInputSourceClosed ? { inputSourceDisposition: "backend" } : {}),
  };
}

export const ffmpegCliBackend: TranscodeBackend = {
  validateHlsSegmentGenerationPolicy(_input) {
    if (!isFfmpegCliAvailable()) throw new FfmpegBackendError(ffmpegUnavailableMessage());
  },

  async generateHlsSegmentWindow(input: HlsSegmentWindowTranscodeInput) {
    return generateStreamingFfmpegWindow(input);
  },

  async cancelJob(sessionId: string, startSegmentIndex: number) {
    const jobKey = encodeJobId(sessionId, startSegmentIndex);
    const stream = activeHlsStreams.get(jobKey);
    activeHlsStreams.delete(jobKey);
    if (stream) {
      await terminateActiveFfmpeg(stream.active);
    }
  },

  async cancel(sessionId: string) {
    const prefix = `${sessionId}\0`;
    for (const [jobKey, stream] of [...activeHlsStreams.entries()]) {
      if (!jobKey.startsWith(prefix)) continue;
      activeHlsStreams.delete(jobKey);
      await terminateActiveFfmpeg(stream.active);
    }
    const entries = [...(activeFfmpeg.get(sessionId) ?? [])];
    await Promise.all(entries.map((entry) => terminateActiveFfmpeg(entry)));
  },
};
