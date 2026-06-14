import type { MediaProbe, MediaProbeStream, ProbeBackend, ProbeInput, SeekableTranscodeInputSource } from "./backend";
import type * as NodeAvApi from "node-av/api";
import type * as NodeAvConstants from "node-av/constants";
import type * as NodeAvLib from "node-av/lib";

type NodeAvModules = {
  api: typeof NodeAvApi;
  constants: typeof NodeAvConstants;
  lib: typeof NodeAvLib;
};

type NodeAvModuleLoader = () => Promise<NodeAvModules>;

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

type ProbeDemuxInput = {
  path: string;
  inputSource?: SeekableTranscodeInputSource;
  signal?: AbortSignal;
};

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
  return new NodeAvBackendError("NodeAV operation was cancelled.");
}

function throwIfNodeAvOperationAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw nodeAvOperationCancelledError();
  }
}

function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal, onAbort?: () => void) {
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
      throw new NodeAvBackendError(`NodeAV failed to load: ${errorMessage(error)}`);
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

function demuxerInput(modules: NodeAvModules, input: ProbeDemuxInput, controller: AbortController) {
  const inputSource = input.inputSource;
  if (!inputSource) return input.path;

  let position = 0n;
  const size = BigInt(inputSource.sizeBytes);

  return {
    read: async (requestedSize: number) => {
      if (controller.signal.aborted) {
        throw new NodeAvBackendError("NodeAV input read was cancelled.");
      }
      if (position >= size) return null;

      const remaining = size - position;
      const safeRemaining = remaining > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(remaining);
      const readLength = Math.min(Math.max(0, Math.floor(requestedSize)), safeRemaining);
      if (readLength <= 0) return null;

      const chunk = await inputSource.read(Number(position), readLength, controller.signal);
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

function demuxerOptions(input: ProbeDemuxInput, controller: AbortController) {
  return {
    signal: controller.signal,
    format: input.inputSource?.format || undefined,
  };
}

function openDemuxer(modules: NodeAvModules, input: ProbeDemuxInput, controller: AbortController) {
  const open = modules.api.Demuxer.open as unknown as (
    source: unknown,
    options?: unknown,
  ) => ReturnType<NodeAvModules["api"]["Demuxer"]["open"]>;
  return open(demuxerInput(modules, input, controller), demuxerOptions(input, controller));
}

function finiteNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function finiteBigInt(value: bigint) {
  if (value <= 0n) return null;
  const asNumber = Number(value);
  return Number.isSafeInteger(asNumber) ? asNumber : null;
}

function streamDurationSeconds(stream: NodeAvStream) {
  if (stream.duration <= 0n || stream.timeBase.den === 0) return null;
  const seconds = Number(stream.duration) * (stream.timeBase.num / stream.timeBase.den);
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

function mapStream(stream: NodeAvStream, modules: NodeAvModules): MediaProbeStream {
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
    sampleRate: type === "audio" ? finiteNumber(stream.codecpar.sampleRate) : null,
    durationSeconds: streamDurationSeconds(stream),
    bitRate: finiteBigInt(stream.codecpar.bitRate),
    raw: {
      codecId: Number(stream.codecpar.codecId),
      codecString: stream.codecpar.getCodecString(),
      metadata,
    },
  };
}

export async function getNodeAvBackendStatus(signal?: AbortSignal): Promise<NodeAvBackendStatus> {
  try {
    await loadNodeAvModules(signal);
    return { available: true, message: null };
  } catch (error) {
    return { available: false, message: errorMessage(error) };
  }
}

export function setNodeAvModuleLoaderForTests(loader: NodeAvModuleLoader | null) {
  moduleLoader = loader ?? defaultNodeAvModuleLoader;
  modulesPromise = null;
}

export const nodeAvBackend: ProbeBackend = {
  async probe(input: ProbeInput): Promise<MediaProbe> {
    const modules = await loadNodeAvModules(input.signal);
    throwIfNodeAvOperationAborted(input.signal);
    const controller = new AbortController();
    const cancelFromInputSignal = () => controller.abort();
    input.signal?.addEventListener("abort", cancelFromInputSignal, {
      once: true,
    });
    let demuxer: Awaited<ReturnType<NodeAvModules["api"]["Demuxer"]["open"]>> | undefined;

    try {
      demuxer = await openDemuxer(
        modules,
        {
          path: input.path,
          inputSource: input.inputSource,
          signal: input.signal,
        },
        controller,
      );
      return {
        container: demuxer.formatName === "unknown" ? null : demuxer.formatName,
        durationSeconds: finiteNumber(demuxer.duration),
        bitRate: finiteNumber(demuxer.bitRate),
        streams: demuxer.streams.map((stream) => mapStream(stream as NodeAvStream, modules)),
      };
    } finally {
      input.signal?.removeEventListener("abort", cancelFromInputSignal);
      await demuxer?.close();
    }
  },
};
