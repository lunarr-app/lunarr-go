import { DEFAULT_SFTP_OPERATION_TIMEOUT_MS, type LibraryStorage } from "../storage";
import type { SeekableTranscodeInputSource } from "./backend";
import type { Readable } from "node:stream";

const REMOTE_READ_CANCELLED_MESSAGE = "Remote media read was cancelled.";
const SEEKABLE_READ_AHEAD_BYTES = 2 * 1024 * 1024;
const SEEKABLE_MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export type SeekableStorageFile = {
  path: string;
  extension: string | null;
  container: string | null;
  sizeBytes: number;
};

export function nodeAvInputFormat(file: { container: string | null; extension: string | null }) {
  const values = [file.container, file.extension]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase().replace(/^\./, ""));

  if (values.some((value) => value === "matroska" || value === "mkv")) {
    return "matroska";
  }
  if (values.some((value) => value === "mp4" || value === "m4v" || value === "mov")) {
    return "mp4";
  }
  if (values.includes("webm")) return "webm";
  if (values.includes("avi")) return "avi";
  if (values.includes("mpegts") || values.includes("ts")) return "mpegts";
  return null;
}

export function hasSeekableRemoteSize(file: { size_bytes?: number; sizeBytes?: number }) {
  const size = file.size_bytes ?? file.sizeBytes;
  return Number.isSafeInteger(size) && Number(size) > 0;
}

function withOperationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onLateResolve?: (value: T) => Promise<void> | void,
  signal?: AbortSignal,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let abortHandler: (() => void) | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      stopped = true;
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
  const abortPromise = new Promise<never>((_, reject) => {
    if (!signal) return;
    abortHandler = () => {
      stopped = true;
      reject(new Error(REMOTE_READ_CANCELLED_MESSAGE));
    };
    if (signal.aborted) {
      abortHandler();
      return;
    }
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  promise
    .then((value) => {
      if (!stopped || !onLateResolve) return;
      void Promise.resolve(onLateResolve(value)).catch(() => undefined);
    })
    .catch(() => undefined);

  return Promise.race([promise, timeoutPromise, abortPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
  });
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
    return await withOperationTimeout(
      streamToBuffer(input.stream, input.signal),
      input.timeoutMs,
      input.label,
    );
  } catch (error) {
    input.stream.destroy(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

export function createSeekableInputSourceFromStorage(input: {
  file: SeekableStorageFile;
  storage: LibraryStorage;
  timeoutMs?: number;
  setupSignal?: AbortSignal;
}): SeekableTranscodeInputSource {
  const format = nodeAvInputFormat(input.file);
  if (!format) {
    throw new Error("Remote media format is not known enough for seekable reads.");
  }
  if (!hasSeekableRemoteSize(input.file)) {
    throw new Error("Remote media size is not known enough for seekable reads.");
  }

  let closed = false;
  let readAhead: { start: number; buffer: Buffer } | null = null;
  const sizeBytes = input.file.sizeBytes;
  const timeoutMs = input.timeoutMs ?? DEFAULT_SFTP_OPERATION_TIMEOUT_MS;

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
      if (
        readAhead &&
        start >= readAhead.start &&
        start + length <= readAhead.start + readAhead.buffer.length
      ) {
        return readAhead.buffer.subarray(start - readAhead.start, start - readAhead.start + length);
      }

      const requestedBytes = Math.min(sizeBytes - start, length);
      const readAheadBytes =
        length <= SEEKABLE_MAX_BUFFER_BYTES
          ? Math.min(
              sizeBytes - start,
              Math.max(length, SEEKABLE_READ_AHEAD_BYTES),
              SEEKABLE_MAX_BUFFER_BYTES,
            )
          : requestedBytes;
      const end = start + readAheadBytes - 1;
      const readAbort = linkedAbortSignals(input.setupSignal, readSignal);
      let buffer: Buffer;
      try {
        const stream = await withOperationTimeout(
          input.storage.createReadStream(input.file.path, { start, end }, { keepOpen: true }),
          timeoutMs,
          `Remote range read ${input.file.path}`,
          (lateStream) => {
            lateStream.on("error", () => undefined);
            lateStream.destroy();
          },
          readAbort.signal,
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
