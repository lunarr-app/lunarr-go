import type { SeekableTranscodeInputSource } from "./backend";
import { randomInt, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";

const DEFAULT_PROXY_TTL_MS = 6 * 60 * 60 * 1000;
const STREAM_CHUNK_BYTES = 1024 * 1024;
const PROXY_PORT_MIN = 30000;
const PROXY_PORT_MAX = 40999;
const PROXY_LISTEN_ATTEMPTS = 25;

type ByteRange = {
  start: number;
  end: number;
};

export type RunningSeekableInputProxy = {
  url: string;
  close(): Promise<void>;
};

type SeekableInputProxyInput = {
  sessionId: string;
  inputSource: SeekableTranscodeInputSource;
  ttlMs?: number;
  signal?: AbortSignal;
};

let listenQueue = Promise.resolve();

function parseRange(rangeHeader: string | undefined, size: number) {
  if (!rangeHeader || size <= 0) return null;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const startText = match[1];
  const endText = match[2];
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

function commonHeaders(size: number) {
  return {
    "accept-ranges": "bytes",
    "content-type": "application/octet-stream",
    "content-length": String(size),
  };
}

function writeHead(
  response: ServerResponse,
  status: number,
  headers: Record<string, string>,
) {
  if (!response.headersSent) response.writeHead(status, headers);
}

async function writeRange(input: {
  source: SeekableTranscodeInputSource;
  response: ServerResponse;
  range: ByteRange;
  signal: AbortSignal;
}) {
  let offset = input.range.start;
  while (offset <= input.range.end) {
    if (input.signal.aborted || input.response.destroyed) return;
    const requestedBytes = Math.min(
      STREAM_CHUNK_BYTES,
      input.range.end - offset + 1,
    );
    const chunk = await input.source.read(offset, requestedBytes, input.signal);
    if (chunk.length !== requestedBytes) {
      throw new Error(
        `${input.source.label} returned ${chunk.length} bytes for a ${requestedBytes} byte proxy request.`,
      );
    }
    if (!input.response.write(chunk)) {
      await once(input.response, "drain");
    }
    offset += chunk.length;
  }
  input.response.end();
}

function unauthorized(response: ServerResponse) {
  writeHead(response, 403, { "content-type": "text/plain" });
  response.end("Forbidden");
}

function methodNotAllowed(response: ServerResponse) {
  writeHead(response, 405, {
    "content-type": "text/plain",
    allow: "GET, HEAD",
  });
  response.end("Method not allowed");
}

async function listenOnLoopbackUnlocked(
  server: ReturnType<typeof createServer>,
  attempt: number,
) {
  const port =
    attempt === 0 ? 0 : randomInt(PROXY_PORT_MIN, PROXY_PORT_MAX + 1);
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    try {
      server.listen({ port, host: "127.0.0.1" });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function listenOnLoopback(
  server: ReturnType<typeof createServer>,
  attempt: number,
) {
  const listen = listenQueue.then(
    () => listenOnLoopbackUnlocked(server, attempt),
    () => listenOnLoopbackUnlocked(server, attempt),
  );
  listenQueue = listen.then(
    () => undefined,
    () => undefined,
  );
  await listen;
}

function isAddressInUse(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "EADDRINUSE";
}

export async function startSeekableInputProxy(
  input: SeekableInputProxyInput,
): Promise<RunningSeekableInputProxy> {
  const token = randomUUID();
  const expiresAt =
    Date.now() + Math.max(1, input.ttlMs ?? DEFAULT_PROXY_TTL_MS);
  const activeRequests = new Set<AbortController>();

  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    const controller = new AbortController();
    activeRequests.add(controller);
    const abort = () => controller.abort();
    const abortIfResponseOpen = () => {
      if (!response.writableEnded) abort();
    };
    request.on("aborted", abort);
    response.on("close", abortIfResponseOpen);

    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        methodNotAllowed(response);
        return;
      }

      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (
        url.pathname !== `/input/${input.sessionId}` ||
        url.searchParams.get("token") !== token ||
        Date.now() > expiresAt
      ) {
        unauthorized(response);
        return;
      }

      const size = input.inputSource.sizeBytes;
      const rangeHeader = request.headers.range;
      const range = parseRange(
        typeof rangeHeader === "string" ? rangeHeader : undefined,
        size,
      );

      if (rangeHeader && !range) {
        writeHead(response, 416, {
          "accept-ranges": "bytes",
          "content-range": `bytes */${size}`,
          "content-type": "text/plain",
        });
        response.end("Range not satisfiable");
        return;
      }

      if (!range) {
        const headers = commonHeaders(size);
        writeHead(response, 200, headers);
        if (request.method === "HEAD") {
          response.end();
          return;
        }
        if (size === 0) {
          response.end();
          return;
        }
        await writeRange({
          source: input.inputSource,
          response,
          range: { start: 0, end: size - 1 },
          signal: controller.signal,
        });
        return;
      }

      writeHead(response, 206, {
        ...commonHeaders(range.end - range.start + 1),
        "content-range": `bytes ${range.start}-${range.end}/${size}`,
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      await writeRange({
        source: input.inputSource,
        response,
        range,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted || response.destroyed) return;
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      writeHead(response, 500, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : "Proxy failed");
    } finally {
      request.off("aborted", abort);
      response.off("close", abortIfResponseOpen);
      activeRequests.delete(controller);
    }
  };

  let server: ReturnType<typeof createServer> | undefined;
  let lastListenError: unknown;
  for (let attempt = 0; attempt < PROXY_LISTEN_ATTEMPTS; attempt += 1) {
    server = createServer(handleRequest);
    try {
      await listenOnLoopback(server, attempt);
      break;
    } catch (error) {
      lastListenError = error;
      server.close();
      server = undefined;
      if (!isAddressInUse(error)) throw error;
    }
  }

  if (!server?.listening) {
    throw lastListenError instanceof Error
      ? lastListenError
      : new Error("Failed to bind FFmpeg input proxy.");
  }

  const runningServer = server;

  input.signal?.addEventListener("abort", () => runningServer.close(), {
    once: true,
  });
  const address = runningServer.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}/input/${input.sessionId}?token=${encodeURIComponent(token)}`,
    async close() {
      for (const controller of activeRequests) controller.abort();
      if (!runningServer.listening) return;
      await new Promise<void>((resolve, reject) => {
        runningServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
