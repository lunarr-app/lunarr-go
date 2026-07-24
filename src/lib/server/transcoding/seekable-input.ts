import type { LibraryStorage } from "../storage";
import { DEFAULT_REMOTE_OPERATION_TIMEOUT_MS } from "../storage/remote";
import { withTimeout } from "../timeout";
import type { SeekableTranscodeInputSource } from "./backend";
import { detectContainerFromMagic, resolveNodeAvInputFormat } from "./container-format";
import type { Readable } from "node:stream";

export const REMOTE_READ_CANCELLED_MESSAGE = "Remote media read was cancelled.";
const SEEKABLE_READ_AHEAD_BYTES = 512 * 1024;
const SEEKABLE_MAX_BUFFER_BYTES = 1024 * 1024;
const MAGIC_SNIFF_BYTES = 376;

export type SeekableStorageFile = {
  path: string;
  extension: string | null;
  container: string | null;
  sizeBytes: number;
};

export function hasSeekableRemoteSize(file: { size_bytes?: number; sizeBytes?: number }) {
  const size = file.size_bytes ?? file.sizeBytes;
  return Number.isSafeInteger(size) && Number(size) > 0;
}

function linkedAbortSignals(...signals: Array<AbortSignal | undefined>) {
  const activeSignals = signals.filter((item): item is AbortSignal => Boolean(item));
  if (activeSignals.length <= 1) {
    return {
      signal: activeSignals[0],
      cleanup: () => undefined,
    };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const signal of activeSignals) signal.removeEventListener("abort", abort);
    },
  };
}

async function streamToBuffer(stream: Readable, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error(REMOTE_READ_CANCELLED_MESSAGE);
  const chunks: Buffer[] = [];
  const abort = () => stream.destroy(new Error(REMOTE_READ_CANCELLED_MESSAGE));
  stream.on("error", () => undefined);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for await (const chunk of stream) {
      if (signal?.aborted) throw new Error(REMOTE_READ_CANCELLED_MESSAGE);
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } finally {
    signal?.removeEventListener("abort", abort);
  }
  return Buffer.concat(chunks);
}

async function readStreamToBufferWithTimeout(input: {
  stream: Readable;
  signal?: AbortSignal;
  timeoutMs: number;
  label: string;
}) {
  try {
    return await withTimeout(streamToBuffer(input.stream, input.signal), input.timeoutMs, input.label);
  } catch (error) {
    input.stream.destroy(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

export async function sniffContainerFromStorage(input: {
  filePath: string;
  storage: LibraryStorage;
  sizeBytes: number;
  timeoutMs?: number;
  setupSignal?: AbortSignal;
}): Promise<{ container: string | null; head: Buffer | null }> {
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    return { container: null, head: null };
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_REMOTE_OPERATION_TIMEOUT_MS;
  const end = Math.min(input.sizeBytes - 1, MAGIC_SNIFF_BYTES - 1);
  const readAbort = linkedAbortSignals(input.setupSignal);
  try {
    const stream = await withTimeout(
      input.storage.createReadStream(input.filePath, { start: 0, end }, { keepOpen: true }),
      timeoutMs,
      `Remote magic sniff ${input.filePath}`,
      {
        onLateResolve: (lateStream) => {
          lateStream.on("error", () => undefined);
          lateStream.destroy();
        },
        signal: readAbort.signal,
        abortMessage: REMOTE_READ_CANCELLED_MESSAGE,
      },
    );
    const head = await readStreamToBufferWithTimeout({
      stream,
      signal: readAbort.signal,
      timeoutMs,
      label: `Remote magic sniff ${input.filePath}`,
    });
    return {
      container: detectContainerFromMagic(head),
      head,
    };
  } catch (error) {
    if (error instanceof Error && error.message === REMOTE_READ_CANCELLED_MESSAGE) {
      throw error;
    }
    return { container: null, head: null };
  } finally {
    readAbort.cleanup();
  }
}

export async function createSeekableInputSourceFromStorage(input: {
  file: SeekableStorageFile;
  storage: LibraryStorage;
  timeoutMs?: number;
  setupSignal?: AbortSignal;
  sniff?: boolean;
}): Promise<SeekableTranscodeInputSource> {
  if (!hasSeekableRemoteSize(input.file)) {
    throw new Error("Remote media size is not known enough for seekable reads.");
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_REMOTE_OPERATION_TIMEOUT_MS;
  const { container: sniffedContainer, head: prefixBuffer } =
    input.sniff === false
      ? { container: null, head: null }
      : await sniffContainerFromStorage({
          filePath: input.file.path,
          storage: input.storage,
          sizeBytes: input.file.sizeBytes,
          timeoutMs,
          setupSignal: input.setupSignal,
        });
  const format = resolveNodeAvInputFormat({
    sniffedContainer,
    container: input.file.container,
    extension: input.file.extension,
  });
  if (!format) {
    throw new Error("Remote media format is not known enough for seekable reads.");
  }

  let closed = false;
  let readAhead: { start: number; buffer: Buffer } | null =
    prefixBuffer && prefixBuffer.length > 0 ? { start: 0, buffer: prefixBuffer } : null;
  const sizeBytes = input.file.sizeBytes;

  return {
    kind: "seekable",
    label: input.file.path,
    sizeBytes,
    format,
    async read(start, length, readSignal) {
      if (closed) throw new Error("Remote media input is already closed.");
      if (input.setupSignal?.aborted || readSignal?.aborted) {
        throw new Error(REMOTE_READ_CANCELLED_MESSAGE);
      }
      if (!Number.isSafeInteger(start) || start < 0) {
        throw new Error("Invalid remote media read offset.");
      }
      if (!Number.isSafeInteger(length) || length <= 0) return Buffer.alloc(0);
      if (start >= sizeBytes) return Buffer.alloc(0);
      if (readAhead && start >= readAhead.start && start + length <= readAhead.start + readAhead.buffer.length) {
        return readAhead.buffer.subarray(start - readAhead.start, start - readAhead.start + length);
      }

      const requestedBytes = Math.min(sizeBytes - start, length);
      const readAheadBytes =
        length <= SEEKABLE_MAX_BUFFER_BYTES
          ? Math.min(sizeBytes - start, Math.max(length, SEEKABLE_READ_AHEAD_BYTES), SEEKABLE_MAX_BUFFER_BYTES)
          : requestedBytes;
      const end = start + readAheadBytes - 1;
      const readAbort = linkedAbortSignals(input.setupSignal, readSignal);
      let buffer: Buffer;
      try {
        const stream = await withTimeout(
          input.storage.createReadStream(input.file.path, { start, end }, { keepOpen: true }),
          timeoutMs,
          `Remote range read ${input.file.path}`,
          {
            onLateResolve: (lateStream) => {
              lateStream.on("error", () => undefined);
              lateStream.destroy();
            },
            signal: readAbort.signal,
            abortMessage: REMOTE_READ_CANCELLED_MESSAGE,
          },
        );
        buffer = await readStreamToBufferWithTimeout({
          stream,
          signal: readAbort.signal,
          timeoutMs,
          label: `Remote range read ${input.file.path}`,
        });
      } finally {
        readAbort.cleanup();
      }

      if (buffer.length < requestedBytes) {
        throw new Error(
          `Remote range read ${input.file.path} returned ${buffer.length} bytes for a ${requestedBytes} byte request.`,
        );
      }
      readAhead = buffer.length <= SEEKABLE_MAX_BUFFER_BYTES ? { start, buffer } : null;
      return buffer.subarray(0, requestedBytes);
    },
    async close() {
      closed = true;
    },
  };
}
