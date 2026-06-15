import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { startSeekableInputProxy, type RunningSeekableInputProxy } from "./input-proxy";
import type { SeekableTranscodeInputSource } from "./backend";

type ProxyResponse = {
  status: number;
  header(name: string): string | null;
  body: string;
};

function source(body: Buffer): SeekableTranscodeInputSource {
  return {
    kind: "seekable",
    label: "test input",
    sizeBytes: body.length,
    async read(start, length) {
      return body.subarray(start, start + length);
    },
    async close() {
      return;
    },
  };
}

function proxyRequest(url: string, options: { method?: string; headers?: Record<string, string> } = {}) {
  return new Promise<ProxyResponse>((resolve, reject) => {
    const parsed = new URL(url);
    const req = httpRequest(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? "GET",
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const headers = new Map<string, string>();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value === undefined) continue;
            headers.set(key.toLowerCase(), Array.isArray(value) ? value[0] : value);
          }
          resolve({
            status: res.statusCode ?? 0,
            header(name) {
              return headers.get(name.toLowerCase()) ?? null;
            },
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function withProxy<T>(
  run: (started: RunningSeekableInputProxy) => Promise<T>,
  body = Buffer.from("0123456789abcdef"),
) {
  const started = await startSeekableInputProxy({
    sessionId: randomUUID(),
    inputSource: source(body),
  });
  try {
    return await run(started);
  } finally {
    await started.close();
  }
}

describe.serial("seekable FFmpeg input proxy", () => {
  test("serves HEAD metadata for the full input", async () => {
    await withProxy(async (started) => {
      const response = await proxyRequest(started.url, { method: "HEAD" });

      expect(response.status).toBe(200);
      expect(response.header("accept-ranges")).toBe("bytes");
      expect(response.header("content-length")).toBe("16");
      expect(response.body).toBe("");
    });
  });

  test("serves ranged GET and HEAD requests", async () => {
    await withProxy(async (started) => {
      const getResponse = await proxyRequest(started.url, {
        headers: { Range: "bytes=4-8" },
      });
      const headResponse = await proxyRequest(started.url, {
        method: "HEAD",
        headers: { Range: "bytes=9-12" },
      });

      expect(getResponse.status).toBe(206);
      expect(getResponse.header("content-range")).toBe("bytes 4-8/16");
      expect(getResponse.header("content-length")).toBe("5");
      expect(getResponse.body).toBe("45678");
      expect(headResponse.status).toBe(206);
      expect(headResponse.header("content-range")).toBe("bytes 9-12/16");
      expect(headResponse.header("content-length")).toBe("4");
      expect(headResponse.body).toBe("");
    });
  });

  test("serves full GET requests when FFmpeg does not ask for a range", async () => {
    await withProxy(async (started) => {
      const response = await proxyRequest(started.url);

      expect(response.status).toBe(200);
      expect(response.header("content-length")).toBe("16");
      expect(response.body).toBe("0123456789abcdef");
    });
  });

  test("rejects invalid ranges and tokens", async () => {
    await withProxy(async (started) => {
      const badTokenUrl = new URL(started.url);
      badTokenUrl.searchParams.set("token", "wrong");

      const rangeResponse = await proxyRequest(started.url, {
        headers: { Range: "bytes=40-80" },
      });
      const tokenResponse = await proxyRequest(badTokenUrl.toString());

      expect(rangeResponse.status).toBe(416);
      expect(rangeResponse.header("content-range")).toBe("bytes */16");
      expect(tokenResponse.status).toBe(403);
    });
  });
});
