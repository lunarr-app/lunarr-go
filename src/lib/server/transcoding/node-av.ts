import type {
  CompatibilityHlsBackend,
  HlsSegmentGenerationPolicyInput,
  HlsSegmentWindowGeneration,
  HlsSegmentWindowEntry,
  HlsSegmentWindowTranscodeInput,
  HlsTranscodeInput,
  MediaProbe,
  MediaProbeStream,
  ProbeBackend,
  ProbeInput,
  RunningTranscode,
  TranscodeBackend,
} from "./backend";
import type * as NodeAvApi from "node-av/api";
import type * as NodeAvConstants from "node-av/constants";
import type * as NodeAvLib from "node-av/lib";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type NodeAvModules = {
  api: typeof NodeAvApi;
  constants: typeof NodeAvConstants;
  lib: typeof NodeAvLib;
};

type NodeAvModuleLoader = () => Promise<NodeAvModules>;
type NodeAvHardwareContext = NonNullable<
  ReturnType<NodeAvModules["api"]["HardwareContext"]["auto"]>
>;

type ActiveTranscode = {
  controller: AbortController;
  completion: Promise<void>;
  cancel?: () => void;
};

type NodeAvStream = {
  index: number;
  duration: bigint;
  timeBase: { num: number; den: number };
  metadata: { getAll(): Record<string, string> } | null;
  codecpar: {
    bitRate: bigint;
    channels: number;
    codecId: NodeAvModules["constants"]["AV_CODEC_ID_NONE"];
    codecType: NodeAvModules["constants"]["AVMEDIA_TYPE_UNKNOWN"];
    getCodecString(): string | null;
    height: number;
    sampleRate: number;
    width: number;
  };
};

type GeneratedHlsSegmentProbe = {
  audioStreamCount: number;
  comparableVideoTimestampCount: number;
  durationSeconds: number | null;
  firstVideoPacketIsKeyframe: boolean | null;
  firstVideoTimestampSeconds: number | null;
  lastVideoTimestampSeconds: number | null;
  videoTimestampsMonotonic: boolean;
  videoStreamCount: number;
};

function demuxerInput(
  modules: NodeAvModules,
  input: HlsTranscodeInput,
  controller: AbortController,
) {
  const inputSource = input.inputSource;
  if (!inputSource) return input.inputPath;

  let position = 0n;
  const size = BigInt(inputSource.sizeBytes);

  return {
    read: async (requestedSize: number) => {
      if (controller.signal.aborted) {
        throw new NodeAvBackendError("NodeAV input read was cancelled.");
      }
      if (position >= size) return null;

      const remaining = size - position;
      const safeRemaining =
        remaining > BigInt(Number.MAX_SAFE_INTEGER)
          ? Number.MAX_SAFE_INTEGER
          : Number(remaining);
      const readLength = Math.min(
        Math.max(0, Math.floor(requestedSize)),
        safeRemaining,
      );
      if (readLength <= 0) return null;

      const chunk = await inputSource.read(
        Number(position),
        readLength,
        controller.signal,
      );
      if (chunk.length === 0) return null;
      position += BigInt(chunk.length);
      return chunk;
    },
    seek: (offset: bigint, whence: number) => {
      if (whence === modules.constants.AVSEEK_SIZE) return size;
      if (whence === modules.constants.AVSEEK_SET) {
        position = offset;
      } else if (whence === modules.constants.AVSEEK_CUR) {
        position += offset;
      } else if (whence === modules.constants.AVSEEK_END) {
        position = size + offset;
      } else {
        return -1;
      }

      if (position < 0n) position = 0n;
      if (position > size) position = size;
      return position;
    },
  };
}

function demuxerOptions(input: HlsTranscodeInput, controller: AbortController) {
  return {
    signal: controller.signal,
    format: input.inputSource?.format || undefined,
  };
}

function openDemuxer(
  modules: NodeAvModules,
  input: HlsTranscodeInput,
  controller: AbortController,
) {
  const open = modules.api.Demuxer.open as unknown as (
    source: unknown,
    options?: unknown,
  ) => ReturnType<NodeAvModules["api"]["Demuxer"]["open"]>;
  return open(
    demuxerInput(modules, input, controller),
    demuxerOptions(input, controller),
  );
}

export type NodeAvBackendStatus =
  | {
      available: true;
      message: null;
    }
  | {
      available: false;
      message: string;
    };

export class NodeAvBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeAvBackendError";
  }
}

let moduleLoader: NodeAvModuleLoader = defaultNodeAvModuleLoader;
let modulesPromise: Promise<NodeAvModules> | null = null;
const activeTranscodes = new Map<string, ActiveTranscode>();
const activeSegmentGenerations = new Map<string, Set<ActiveTranscode>>();

async function defaultNodeAvModuleLoader(): Promise<NodeAvModules> {
  const [api, constants, lib] = await Promise.all([
    import("node-av/api"),
    import("node-av/constants"),
    import("node-av/lib"),
  ]);
  lib.Log.setLevel(constants.AV_LOG_QUIET);

  return { api, constants, lib };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function nodeAvOperationCancelledError() {
  return new NodeAvBackendError("NodeAV HLS operation was cancelled.");
}

function throwIfNodeAvOperationAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw nodeAvOperationCancelledError();
  }
}

function withAbortSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  onAbort?: () => void,
) {
  if (!signal) return promise;
  throwIfNodeAvOperationAborted(signal);

  let abort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    abort = () => {
      onAbort?.();
      reject(nodeAvOperationCancelledError());
    };
    signal.addEventListener("abort", abort, { once: true });
  });

  return Promise.race([promise, abortPromise]).finally(() => {
    if (abort) {
      signal.removeEventListener("abort", abort);
    }
  });
}

async function loadNodeAvModules(signal?: AbortSignal) {
  throwIfNodeAvOperationAborted(signal);
  const loading =
    modulesPromise ??
    moduleLoader().catch((error: unknown) => {
      modulesPromise = null;
      throw new NodeAvBackendError(
        `NodeAV failed to load: ${errorMessage(error)}`,
      );
    });
  modulesPromise = loading;
  return withAbortSignal(loading, signal, () => {
    if (modulesPromise === loading) {
      modulesPromise = null;
    }
  }).catch((error: unknown) => {
    if (error instanceof NodeAvBackendError && modulesPromise === loading) {
      modulesPromise = null;
    }
    throw error;
  });
}

function finiteNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizedStartTimeSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function finiteBigInt(value: bigint) {
  if (value <= 0n) return null;
  const asNumber = Number(value);
  return Number.isSafeInteger(asNumber) ? asNumber : null;
}

function packetTimestampSeconds(
  value: bigint,
  timeBase: { num: number; den: number },
  constants: NodeAvModules["constants"],
) {
  if (value === constants.AV_NOPTS_VALUE || timeBase.den === 0) return null;
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) return null;
  const seconds = asNumber * (timeBase.num / timeBase.den);
  return Number.isFinite(seconds) ? seconds : null;
}

export function validateGeneratedHlsSegmentProbe(input: {
  probe: GeneratedHlsSegmentProbe;
  expectedDurationSeconds: number;
  expectAudio?: boolean;
}) {
  if (input.probe.videoStreamCount <= 0) {
    throw new NodeAvBackendError(
      "NodeAV generated an HLS segment without a video stream.",
    );
  }
  if (input.expectAudio && input.probe.audioStreamCount <= 0) {
    throw new NodeAvBackendError(
      "NodeAV generated an HLS segment without an expected audio stream.",
    );
  }
  if (input.probe.firstVideoPacketIsKeyframe === null) {
    throw new NodeAvBackendError(
      "NodeAV generated an HLS segment without a video packet.",
    );
  }
  if (!input.probe.firstVideoPacketIsKeyframe) {
    throw new NodeAvBackendError(
      "NodeAV generated an HLS segment that does not start with a video keyframe.",
    );
  }
  if (
    input.probe.comparableVideoTimestampCount >= 2 &&
    !input.probe.videoTimestampsMonotonic
  ) {
    throw new NodeAvBackendError(
      "NodeAV generated an HLS segment with non-monotonic video timestamps.",
    );
  }

  const expectedDurationSeconds = finiteNumber(input.expectedDurationSeconds);
  const actualDurationSeconds = finiteNumber(input.probe.durationSeconds ?? 0);
  const firstTimestamp = input.probe.firstVideoTimestampSeconds;
  const lastTimestamp = input.probe.lastVideoTimestampSeconds;
  const timestampSpanSeconds =
    input.probe.comparableVideoTimestampCount >= 2 &&
    firstTimestamp !== null &&
    lastTimestamp !== null
      ? lastTimestamp - firstTimestamp
      : null;
  const validTimestampSpanSeconds =
    timestampSpanSeconds !== null && Number.isFinite(timestampSpanSeconds)
      ? timestampSpanSeconds
      : null;
  const effectiveDurationSeconds =
    validTimestampSpanSeconds !== null && validTimestampSpanSeconds > 0
      ? validTimestampSpanSeconds
      : actualDurationSeconds;
  if (!expectedDurationSeconds) {
    throw new NodeAvBackendError(
      "NodeAV generated HLS segment validation requires a positive expected duration.",
    );
  }

  const maximumSegmentSeconds = expectedDurationSeconds + 12;
  if (
    expectedDurationSeconds >= 2 &&
    input.probe.comparableVideoTimestampCount < 2
  ) {
    throw new NodeAvBackendError(
      "NodeAV generated an HLS segment without enough comparable video timestamp evidence.",
    );
  }
  if (
    effectiveDurationSeconds &&
    expectedDurationSeconds >= 2 &&
    effectiveDurationSeconds <
      Math.min(expectedDurationSeconds * 0.5, expectedDurationSeconds - 1)
  ) {
    throw new NodeAvBackendError(
      `NodeAV generated an HLS segment with duration ${effectiveDurationSeconds.toFixed(3)}s for a ${expectedDurationSeconds.toFixed(3)}s request.`,
    );
  }
  if (effectiveDurationSeconds && effectiveDurationSeconds > maximumSegmentSeconds) {
    throw new NodeAvBackendError(
      `NodeAV generated an HLS segment with duration ${effectiveDurationSeconds.toFixed(3)}s for a ${expectedDurationSeconds.toFixed(3)}s request.`,
    );
  }

  if (validTimestampSpanSeconds !== null) {
    if (validTimestampSpanSeconds > maximumSegmentSeconds) {
      throw new NodeAvBackendError(
        `NodeAV generated an HLS segment with video timestamp span ${validTimestampSpanSeconds.toFixed(3)}s for a ${expectedDurationSeconds.toFixed(3)}s request.`,
      );
    }
  }
}

function streamDurationSeconds(stream: NodeAvStream) {
  if (stream.duration <= 0n || stream.timeBase.den === 0) return null;
  const seconds =
    Number(stream.duration) * (stream.timeBase.num / stream.timeBase.den);
  return finiteNumber(seconds);
}

function streamType(
  codecType: NodeAvModules["constants"]["AVMEDIA_TYPE_UNKNOWN"],
  constants: NodeAvModules["constants"],
): MediaProbeStream["type"] {
  if (codecType === constants.AVMEDIA_TYPE_VIDEO) return "video";
  if (codecType === constants.AVMEDIA_TYPE_AUDIO) return "audio";
  if (codecType === constants.AVMEDIA_TYPE_SUBTITLE) return "subtitle";
  return "data";
}

function streamMetadata(stream: NodeAvStream) {
  return stream.metadata?.getAll() ?? {};
}

function mapStream(
  stream: NodeAvStream,
  modules: NodeAvModules,
): MediaProbeStream {
  const codec = modules.lib.Codec.findDecoder(stream.codecpar.codecId);
  const metadata = streamMetadata(stream);
  const type = streamType(stream.codecpar.codecType, modules.constants);

  return {
    index: stream.index,
    type,
    codecName: codec?.name ?? stream.codecpar.getCodecString(),
    codecLongName: codec?.longName ?? null,
    language: metadata.language ?? null,
    title: metadata.title ?? null,
    width: type === "video" ? finiteNumber(stream.codecpar.width) : null,
    height: type === "video" ? finiteNumber(stream.codecpar.height) : null,
    channels: type === "audio" ? finiteNumber(stream.codecpar.channels) : null,
    sampleRate:
      type === "audio" ? finiteNumber(stream.codecpar.sampleRate) : null,
    durationSeconds: streamDurationSeconds(stream),
    bitRate: finiteBigInt(stream.codecpar.bitRate),
    raw: {
      codecId: Number(stream.codecpar.codecId),
      codecString: stream.codecpar.getCodecString(),
      metadata,
    },
  };
}

export async function getNodeAvBackendStatus(
  signal?: AbortSignal,
): Promise<NodeAvBackendStatus> {
  try {
    const modules = await loadNodeAvModules(signal);
    const h264Encoder = modules.lib.Codec.findEncoderByName(
      modules.constants.FF_ENCODER_LIBX264,
    );
    const aacEncoder = modules.lib.Codec.findEncoderByName(
      modules.constants.FF_ENCODER_AAC,
    );

    if (!h264Encoder || !aacEncoder) {
      return {
        available: false,
        message:
          "NodeAV loaded, but required H.264/AAC encoders are unavailable.",
      };
    }

    return { available: true, message: null };
  } catch (error) {
    return { available: false, message: errorMessage(error) };
  }
}

export function setNodeAvModuleLoaderForTests(
  loader: NodeAvModuleLoader | null,
) {
  moduleLoader = loader ?? defaultNodeAvModuleLoader;
  modulesPromise = null;
}

function trackActiveSegmentGeneration(sessionId: string, generation: ActiveTranscode) {
  let active = activeSegmentGenerations.get(sessionId);
  if (!active) {
    active = new Set();
    activeSegmentGenerations.set(sessionId, active);
  }
  active.add(generation);
  generation.completion
    .finally(() => {
      active?.delete(generation);
      if (active?.size === 0) {
        activeSegmentGenerations.delete(sessionId);
      }
    })
    .catch(() => undefined);
}

export function registerActiveSegmentGenerationForTests(sessionId: string) {
  const controller = new AbortController();
  const completion = new Promise<void>((resolve) => {
    controller.signal.addEventListener("abort", () => resolve(), { once: true });
  });
  trackActiveSegmentGeneration(sessionId, { controller, completion });
  return controller.signal;
}

export function activeSegmentGenerationCountForTests(sessionId: string) {
  return activeSegmentGenerations.get(sessionId)?.size ?? 0;
}

function hlsPlaylistPath(artifactDirectory: string) {
  return path.join(artifactDirectory, "master.m3u8");
}

function segmentPattern(artifactDirectory: string) {
  return path.join(artifactDirectory, "segment-%05d.ts");
}

function generatedSegmentPath(artifactDirectory: string, index: number) {
  return path.join(artifactDirectory, `segment-${String(index).padStart(5, "0")}.ts`);
}

async function positiveFileSize(filePath: string) {
  try {
    const details = await stat(filePath);
    return details.isFile() && details.size > 0 ? details.size : 0;
  } catch {
    return 0;
  }
}

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const done = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timeout = setTimeout(done, milliseconds);
    const abort = () => {
      clearTimeout(timeout);
      done();
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function makePlaylistRoutesRelative(
  playlistPath: string,
  artifactDirectory: string,
) {
  const playlist = await readFile(playlistPath, "utf8");
  const normalizedArtifactDirectory = artifactDirectory.replace(/\\/g, "/");
  const escapedArtifactDirectory = normalizedArtifactDirectory.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const absolutePrefix = new RegExp(`${escapedArtifactDirectory}/`, "g");
  await writeFile(
    playlistPath,
    playlist.replace(absolutePrefix, ""),
    "utf8",
  );
}

function hlsMuxerOptions(input: HlsTranscodeInput) {
  return {
    hls_time: input.segmentSeconds,
    hls_list_size: 0,
    hls_playlist_type: "event",
    hls_segment_filename: segmentPattern(input.artifactDirectory),
  };
}

function hlsMuxerTimestampOptions(startTimeSeconds: number | null) {
  return {
    startTime: startTimeSeconds ?? undefined,
    copyPriorStart: startTimeSeconds !== null ? 0 : undefined,
  };
}

function normalizedOutputTimelineStartSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function timestampResetExpression(outputTimelineStartSeconds: number) {
  return outputTimelineStartSeconds > 0
    ? `PTS-STARTPTS+${outputTimelineStartSeconds}/TB`
    : "PTS-STARTPTS";
}

function hardwareDeviceTypeForPolicy(
  modules: NodeAvModules,
  mode: HlsSegmentGenerationPolicyInput["hardwareAcceleration"],
) {
  switch (mode) {
    case "videotoolbox":
      return modules.constants.FF_HWDEVICE_TYPE_VIDEOTOOLBOX;
    case "vaapi":
      return modules.constants.FF_HWDEVICE_TYPE_VAAPI;
    case "qsv":
      return modules.constants.FF_HWDEVICE_TYPE_QSV;
    case "nvenc":
      return modules.constants.FF_HWDEVICE_TYPE_CUDA;
    case "amf":
      return modules.constants.FF_HWDEVICE_TYPE_AMF;
    case "auto":
    case "off":
      return null;
  }
}

function closeHardwareContext(hardware: NodeAvHardwareContext | null) {
  hardware?.dispose();
}

function hardwareUnavailableMessage(
  input: HlsSegmentGenerationPolicyInput,
  reason: string,
) {
  return `Hardware acceleration "${input.hardwareAcceleration}" is required, but ${reason}.`;
}

function createHardwareContextForPolicy(
  modules: NodeAvModules,
  input: HlsSegmentGenerationPolicyInput,
): NodeAvHardwareContext | null {
  if (input.hardwareAcceleration === "off") return null;

  try {
    const hardware =
      input.hardwareAcceleration === "auto"
        ? modules.api.HardwareContext.auto()
        : modules.api.HardwareContext.create(
            hardwareDeviceTypeForPolicy(modules, input.hardwareAcceleration)!,
          );

    if (!hardware) {
      if (input.hardwareAccelerationRequired) {
        throw new NodeAvBackendError(
          hardwareUnavailableMessage(input, "NodeAV could not create a hardware device"),
        );
      }
      return null;
    }

    const encoder = hardware.getEncoderCodec("h264", true);
    if (encoder) return hardware;
    closeHardwareContext(hardware);

    if (input.hardwareAccelerationRequired) {
      throw new NodeAvBackendError(
        hardwareUnavailableMessage(input, "no H.264 hardware encoder is available"),
      );
    }
    return null;
  } catch (error) {
    if (error instanceof NodeAvBackendError) throw error;
    if (input.hardwareAccelerationRequired) {
      throw new NodeAvBackendError(
        hardwareUnavailableMessage(
          input,
          `NodeAV could not initialize it: ${errorMessage(error)}`,
        ),
      );
    }
    return null;
  }
}

function videoEncoderOptions(input: {
  decoder: Awaited<ReturnType<NodeAvModules["api"]["Decoder"]["create"]>>;
  hardware: NodeAvHardwareContext | null;
  segmentSeconds: number;
  signal: AbortSignal;
}) {
  const baseOptions = {
    decoder: input.decoder,
    gopSize: Math.max(1, Math.round(input.segmentSeconds * 30)),
    signal: input.signal,
  };

  if (input.hardware) {
    return {
      ...baseOptions,
      bitrate: "5M",
    };
  }

  return {
    ...baseOptions,
    threadCount: 0,
    options: {
      preset: "veryfast",
      crf: 23,
      pix_fmt: "yuv420p",
    },
  };
}

async function validateHlsSegmentGenerationPolicy(
  input: HlsSegmentGenerationPolicyInput,
  signal?: AbortSignal,
) {
  if (
    input.hardwareAcceleration === "off" ||
    !input.hardwareAccelerationRequired
  ) {
    return;
  }

  const status = await getNodeAvBackendStatus(signal);
  if (!status.available) {
    throw new NodeAvBackendError(status.message);
  }

  const modules = await loadNodeAvModules(signal);
  throwIfNodeAvOperationAborted(signal);
  const hardware = createHardwareContextForPolicy(modules, input);
  closeHardwareContext(hardware);
}

async function runHlsTranscode(
  modules: NodeAvModules,
  input: HlsTranscodeInput,
  controller: AbortController,
) {
  const hardware = createHardwareContextForPolicy(modules, input);
  await rm(input.artifactDirectory, { recursive: true, force: true });
  await mkdir(input.artifactDirectory, { recursive: true });

  const demuxer = await openDemuxer(modules, input, controller);
  const startTimeSeconds = normalizedStartTimeSeconds(input.startTimeSeconds);
  const outputTimelineStartSeconds = normalizedOutputTimelineStartSeconds(
    input.outputTimelineStartSeconds,
  );
  const decoders: Array<{ close(): void }> = [];
  const encoders: Array<{ close(): void }> = [];
  const filters: Array<{ close(): void }> = [];

  try {
    if (startTimeSeconds !== null) {
      await demuxer.seek(startTimeSeconds, -1, modules.constants.AVSEEK_FLAG_BACKWARD);
    }

    const videoStream = demuxer.video();
    if (!videoStream) {
      throw new NodeAvBackendError("NodeAV could not find a video stream.");
    }

    const videoDecoder = await modules.api.Decoder.create(videoStream, {
      hardware: hardware ?? undefined,
      signal: controller.signal,
    });
    const videoEncoderCodec =
      hardware?.getEncoderCodec("h264", true) ??
      modules.constants.FF_ENCODER_LIBX264;
    const videoEncoder = await modules.api.Encoder.create(
      videoEncoderCodec,
      videoEncoderOptions({
        decoder: videoDecoder,
        hardware,
        segmentSeconds: input.segmentSeconds,
        signal: controller.signal,
      }),
    );
    decoders.push(videoDecoder);
    encoders.push(videoEncoder);

    const videoStages: unknown[] = [videoDecoder];
    if (outputTimelineStartSeconds !== null) {
      const videoTimestampFilter = modules.api.FilterAPI.create(
        `setpts=${timestampResetExpression(outputTimelineStartSeconds)}`,
        { hardware },
      );
      filters.push(videoTimestampFilter);
      videoStages.push(videoTimestampFilter);
    }
    videoStages.push(videoEncoder);

    const stages: {
      video: unknown[];
      audio?: unknown[];
    } = {
      video: videoStages,
    };

    const audioStream = demuxer.audio();
    if (audioStream) {
      const audioDecoder = await modules.api.Decoder.create(audioStream, {
        signal: controller.signal,
      });
      const audioEncoder = await modules.api.Encoder.create(
        modules.constants.FF_ENCODER_AAC,
        {
          decoder: audioDecoder,
          bitrate: "160k",
          signal: controller.signal,
        },
      );
      decoders.push(audioDecoder);
      encoders.push(audioEncoder);
      const audioStages: unknown[] = [audioDecoder];
      if (outputTimelineStartSeconds !== null) {
        const audioTimestampFilter = modules.api.FilterAPI.create(
          `asetpts=${timestampResetExpression(outputTimelineStartSeconds)}`,
        );
        filters.push(audioTimestampFilter);
        audioStages.push(audioTimestampFilter);
      }
      audioStages.push(audioEncoder);
      stages.audio = audioStages;
    }

    const playlistPath = hlsPlaylistPath(input.artifactDirectory);
    const output = await modules.api.Muxer.open(playlistPath, {
      input: demuxer,
      format: "hls",
      ...hlsMuxerTimestampOptions(startTimeSeconds),
      options: hlsMuxerOptions(input),
      signal: controller.signal,
    });

    const runPipeline = modules.api.pipeline as unknown as (
      ...args: unknown[]
    ) => { completion: Promise<void> };
    const control = runPipeline(demuxer, stages, output, {
      signal: controller.signal,
    });
    await control.completion;
    await makePlaylistRoutesRelative(playlistPath, input.artifactDirectory);
  } finally {
    for (const filter of filters) filter.close();
    for (const encoder of encoders) encoder.close();
    for (const decoder of decoders) decoder.close();
    await demuxer.close();
    closeHardwareContext(hardware);
  }
}

async function runHlsRemux(
  modules: NodeAvModules,
  input: HlsTranscodeInput,
  controller: AbortController,
) {
  await rm(input.artifactDirectory, { recursive: true, force: true });
  await mkdir(input.artifactDirectory, { recursive: true });

  const demuxer = await openDemuxer(modules, input, controller);
  const startTimeSeconds = normalizedStartTimeSeconds(input.startTimeSeconds);

  try {
    if (startTimeSeconds !== null) {
      await demuxer.seek(startTimeSeconds, -1, modules.constants.AVSEEK_FLAG_BACKWARD);
    }

    const playlistPath = hlsPlaylistPath(input.artifactDirectory);
    const output = await modules.api.Muxer.open(playlistPath, {
      input: demuxer,
      format: "hls",
      ...hlsMuxerTimestampOptions(startTimeSeconds),
      options: hlsMuxerOptions(input),
      signal: controller.signal,
    });

    const runPipeline = modules.api.pipeline as unknown as (
      ...args: unknown[]
    ) => { completion: Promise<void> };
    const control = runPipeline(demuxer, output, {
      signal: controller.signal,
    });
    await control.completion;
    await makePlaylistRoutesRelative(playlistPath, input.artifactDirectory);
  } finally {
    await demuxer.close();
  }
}

type PipelineState = {
  settled: boolean;
  failure: unknown;
};

function trackPipelineState(completion: Promise<void>): PipelineState {
  const state: PipelineState = {
    settled: false,
    failure: null,
  };
  completion.then(
    () => {
      state.settled = true;
    },
    (error: unknown) => {
      state.settled = true;
      state.failure = error;
    },
  );
  return state;
}

async function waitForClosedGeneratedSegment(input: {
  artifactDirectory: string;
  segmentIndex: number;
  state: PipelineState;
  deadline: number;
  cancellation?: Promise<never>;
  signal?: AbortSignal;
}) {
  let abort: (() => void) | undefined;
  const abortPromise = input.signal
    ? new Promise<never>((_, reject) => {
        abort = () => reject(nodeAvOperationCancelledError());
        if (input.signal?.aborted) {
          abort();
        } else {
          input.signal?.addEventListener("abort", abort, { once: true });
        }
      })
    : null;
  const wait = (async () => {
    const segmentPath = generatedSegmentPath(input.artifactDirectory, input.segmentIndex);
    const nextSegmentPath = generatedSegmentPath(
      input.artifactDirectory,
      input.segmentIndex + 1,
    );

    throwIfNodeAvOperationAborted(input.signal);
    while (Date.now() < input.deadline) {
      throwIfNodeAvOperationAborted(input.signal);
      if ((await positiveFileSize(segmentPath)) > 0) {
        if (input.state.settled || (await positiveFileSize(nextSegmentPath)) > 0) {
          return segmentPath;
        }
      }

      if (input.state.settled) {
        if ((await positiveFileSize(segmentPath)) > 0) return segmentPath;
        if (input.state.failure) throw input.state.failure;
        throw new NodeAvBackendError("NodeAV did not write the requested HLS segment.");
      }

      await delay(50, input.signal);
    }
    throwIfNodeAvOperationAborted(input.signal);

    throw new NodeAvBackendError("NodeAV HLS segment generation timed out.");
  })();

  const promises: Array<Promise<string> | Promise<never>> = [wait];
  if (abortPromise) promises.push(abortPromise);
  if (input.cancellation) promises.push(input.cancellation);
  return Promise.race(promises).finally(() => {
    if (abort) input.signal?.removeEventListener("abort", abort);
  });
}

async function assertProbeableVideoSegment(
  modules: NodeAvModules,
  segmentPath: string,
  expectedDurationSeconds: number,
  expectAudio = false,
) {
  let demuxer: Awaited<ReturnType<NodeAvModules["api"]["Demuxer"]["open"]>> | null =
    null;
  try {
    demuxer = await modules.api.Demuxer.open(segmentPath);
    const videoStream = demuxer.video();
    let comparableVideoTimestampCount = 0;
    let firstVideoPacketIsKeyframe: boolean | null = null;
    let firstVideoTimestampSeconds: number | null = null;
    let lastVideoTimestampSeconds: number | null = null;
    let videoTimestampsMonotonic = true;
    if (videoStream) {
      let inspectedPackets = 0;
      for await (const packet of demuxer.packets(videoStream.index)) {
        if (!packet) break;
        if (firstVideoPacketIsKeyframe === null) {
          firstVideoPacketIsKeyframe = packet.isKeyframe;
        }

        const timestampSeconds =
          packetTimestampSeconds(packet.dts, packet.timeBase, modules.constants) ??
          packetTimestampSeconds(packet.pts, packet.timeBase, modules.constants);
        if (timestampSeconds !== null) {
          comparableVideoTimestampCount += 1;
          firstVideoTimestampSeconds ??= timestampSeconds;
          if (
            lastVideoTimestampSeconds !== null &&
            timestampSeconds + 0.001 < lastVideoTimestampSeconds
          ) {
            videoTimestampsMonotonic = false;
          }
          lastVideoTimestampSeconds = timestampSeconds;
        }

        packet.free();
        inspectedPackets += 1;
        if (inspectedPackets >= 10_000 || !videoTimestampsMonotonic) break;
      }
    }
    validateGeneratedHlsSegmentProbe({
      probe: {
        audioStreamCount: demuxer.streams.filter(
          (stream) =>
            (stream as NodeAvStream).codecpar.codecType ===
            modules.constants.AVMEDIA_TYPE_AUDIO,
        ).length,
        comparableVideoTimestampCount,
        durationSeconds: finiteNumber(demuxer.duration),
        firstVideoPacketIsKeyframe,
        firstVideoTimestampSeconds,
        lastVideoTimestampSeconds,
        videoTimestampsMonotonic,
        videoStreamCount: videoStream ? 1 : 0,
      },
      expectedDurationSeconds,
      expectAudio,
    });
  } catch (error) {
    if (error instanceof NodeAvBackendError) throw error;
    throw new NodeAvBackendError(
      `NodeAV generated an unreadable HLS segment: ${errorMessage(error)}`,
    );
  } finally {
    await demuxer?.close();
  }
}

async function publishGeneratedWindowSegment(input: {
  modules: NodeAvModules;
  artifactDirectory: string;
  generatedSegment: string;
  requestedSegment: HlsSegmentWindowEntry;
  expectAudio?: boolean;
}) {
  await mkdir(input.artifactDirectory, { recursive: true });
  const finalSegmentPath = path.join(input.artifactDirectory, input.requestedSegment.segment);
  const tempSegmentPath = path.join(
    input.artifactDirectory,
    `.${input.requestedSegment.segment}.${randomUUID()}.tmp`,
  );
  try {
    await copyFile(input.generatedSegment, tempSegmentPath);
    await assertProbeableVideoSegment(
      input.modules,
      tempSegmentPath,
      input.requestedSegment.segmentSeconds,
      input.expectAudio,
    );
    await rename(tempSegmentPath, finalSegmentPath);
  } finally {
    await rm(tempSegmentPath, { force: true });
  }
}

async function runHlsSegmentWindowGeneration(
  modules: NodeAvModules,
  input: HlsSegmentWindowTranscodeInput,
): Promise<HlsSegmentWindowGeneration> {
  const requestedSegments = input.segments.filter((segment) => segment.segmentSeconds > 0);
  const firstSegment = requestedSegments[0];
  if (!firstSegment) return { completion: Promise.resolve() };

  const tempArtifactDirectory = path.join(
    input.artifactDirectory,
    `.segment-window-${firstSegment.segmentIndex}-${randomUUID()}`,
  );
  const controller = new AbortController();
  const cancelFromInputSignal = () => controller.abort();
  throwIfNodeAvOperationAborted(input.signal);
  input.signal?.addEventListener("abort", cancelFromInputSignal, { once: true });
  const runner = input.mode === "remux" ? runHlsRemux : runHlsTranscode;
  const segmentInput: HlsTranscodeInput = {
    ...input,
    artifactDirectory: tempArtifactDirectory,
    startTimeSeconds: firstSegment.segmentStartSeconds,
    outputTimelineStartSeconds: Math.max(
      0,
      firstSegment.segmentStartSeconds -
        (normalizedStartTimeSeconds(input.startTimeSeconds) ?? 0),
    ),
  };
  let resolveRequestedSegment: () => void = () => undefined;
  let rejectRequestedSegment: (error: unknown) => void = () => undefined;
  let requestedSegmentPublished = false;
  let cancelSegmentWindow: (() => void) | undefined;
  const segmentWindowCancellation = new Promise<never>((_, reject) => {
    cancelSegmentWindow = () => reject(nodeAvOperationCancelledError());
  });
  segmentWindowCancellation.catch(() => undefined);
  const requestedSegmentReady = new Promise<void>((resolve, reject) => {
    resolveRequestedSegment = resolve;
    rejectRequestedSegment = reject;
  });

  const completion = (async () => {
    const runnerCompletion = runner(modules, segmentInput, controller);
    const pipelineState = trackPipelineState(runnerCompletion);
    const deadline = Date.now() + (input.segmentGenerationTimeoutMs ?? 60_000);
    try {
      for (let offset = 0; offset < requestedSegments.length; offset += 1) {
        const requestedSegment = requestedSegments[offset];
        const generatedSegment = await waitForClosedGeneratedSegment({
          artifactDirectory: tempArtifactDirectory,
          segmentIndex: offset,
          state: pipelineState,
          deadline,
          cancellation: segmentWindowCancellation,
          signal: controller.signal,
        });
        await publishGeneratedWindowSegment({
          modules,
          artifactDirectory: input.artifactDirectory,
          generatedSegment,
          requestedSegment,
          expectAudio: input.expectAudio,
        });
        if (offset === 0) {
          requestedSegmentPublished = true;
          resolveRequestedSegment();
        }
      }
    } catch (error) {
      if (!requestedSegmentPublished) {
        rejectRequestedSegment(error);
      }
      throw error;
    } finally {
      controller.abort();
      await runnerCompletion.catch(() => undefined);
    }
  })().finally(async () => {
    controller.abort();
    input.signal?.removeEventListener("abort", cancelFromInputSignal);
    await rm(tempArtifactDirectory, { recursive: true, force: true });
  });
  trackActiveSegmentGeneration(input.sessionId, {
    controller,
    completion,
    cancel: () => {
      controller.abort();
      cancelSegmentWindow?.();
    },
  });
  completion.catch(() => undefined);
  await requestedSegmentReady;
  return { completion };
}

export const nodeAvBackend: ProbeBackend & TranscodeBackend & CompatibilityHlsBackend = {
  async probe(input: ProbeInput): Promise<MediaProbe> {
    const modules = await loadNodeAvModules(input.signal);
    throwIfNodeAvOperationAborted(input.signal);
    const controller = new AbortController();
    const cancelFromInputSignal = () => controller.abort();
    input.signal?.addEventListener("abort", cancelFromInputSignal, { once: true });
    let demuxer:
      | Awaited<ReturnType<NodeAvModules["api"]["Demuxer"]["open"]>>
      | undefined;

    try {
      demuxer = await openDemuxer(
        modules,
        {
          sessionId: `probe:${input.mediaFileId}`,
          mediaFileId: input.mediaFileId,
          inputPath: input.path,
          inputSource: input.inputSource,
          artifactDirectory: "",
          segmentSeconds: 0,
          hardwareAcceleration: "off",
          hardwareAccelerationRequired: false,
          signal: input.signal,
        },
        controller,
      );
      return {
        container: demuxer.formatName === "unknown" ? null : demuxer.formatName,
        durationSeconds: finiteNumber(demuxer.duration),
        bitRate: finiteNumber(demuxer.bitRate),
        streams: demuxer.streams.map((stream) =>
          mapStream(stream as NodeAvStream, modules),
        ),
      };
    } finally {
      input.signal?.removeEventListener("abort", cancelFromInputSignal);
      await demuxer?.close();
    }
  },

  async startCompatibilityHls(input: HlsTranscodeInput): Promise<RunningTranscode> {
    throwIfNodeAvOperationAborted(input.signal);
    const status = await getNodeAvBackendStatus(input.signal);
    if (!status.available) {
      throw new NodeAvBackendError(status.message);
    }

    const modules = await loadNodeAvModules(input.signal);
    throwIfNodeAvOperationAborted(input.signal);
    const controller = new AbortController();
    const cancelFromInputSignal = () => controller.abort();
    input.signal?.addEventListener("abort", cancelFromInputSignal, { once: true });
    const playlistPath = hlsPlaylistPath(input.artifactDirectory);
    const runner = input.mode === "remux" ? runHlsRemux : runHlsTranscode;
    const completion = runner(modules, input, controller).finally(() => {
      activeTranscodes.delete(input.sessionId);
      input.signal?.removeEventListener("abort", cancelFromInputSignal);
    });
    completion.catch(() => {
      return;
    });
    activeTranscodes.set(input.sessionId, { controller, completion });

    return {
      sessionId: input.sessionId,
      playlistPath,
      completion,
      async cancel() {
        controller.abort();
        await completion.catch(() => {
          return;
        });
      },
    };
  },

  validateHlsSegmentGenerationPolicy,

  async generateHlsSegmentWindow(input: HlsSegmentWindowTranscodeInput) {
    throwIfNodeAvOperationAborted(input.signal);
    const status = await getNodeAvBackendStatus(input.signal);
    if (!status.available) {
      throw new NodeAvBackendError(status.message);
    }

    const modules = await loadNodeAvModules(input.signal);
    throwIfNodeAvOperationAborted(input.signal);
    return runHlsSegmentWindowGeneration(modules, input);
  },

  async cancel(sessionId: string) {
    const active = activeTranscodes.get(sessionId);
    const segmentGenerations = [
      ...(activeSegmentGenerations.get(sessionId) ?? []),
    ];

    active?.controller.abort();
    for (const generation of segmentGenerations) {
      generation.cancel?.();
      generation.controller.abort();
    }

    await Promise.all([
      active?.completion.catch(() => undefined) ?? Promise.resolve(),
      ...segmentGenerations.map((generation) =>
        generation.completion.catch(() => undefined),
      ),
    ]);
  },
};
