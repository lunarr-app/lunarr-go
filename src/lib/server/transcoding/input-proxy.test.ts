import { describe, expect, test } from "bun:test";
import { startSeekableInputProxy, type RunningSeekableInputProxy } from "./input-proxy";
import type { SeekableTranscodeInputSource } from "./backend";

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

async function withProxy<T>(
  run: (started: RunningSeekableInputProxy) => Promise<T>,
  body = Buffer.from("0123456789abcdef"),
) {
  const started = await startSeekableInputProxy({
    sessionId: "session-1",
    inputSource: source(body),
  });
  try {
    return await run(started);
  } finally {
    await started.close();
  }
}

describe("seekable FFmpeg input proxy", () => {
  test("serves HEAD metadata for the full input", async () => {
    await withProxy(async (started) => {
      const response = await fetch(started.url, { method: "HEAD" });

      expect(response.status).toBe(200);
      expect(response.headers.get("accept-ranges")).toBe("bytes");
      expect(response.headers.get("content-length")).toBe("16");
      expect(await response.text()).toBe("");
    });
  });

  test("serves ranged GET and HEAD requests", async () => {
    await withProxy(async (started) => {
      const getResponse = await fetch(started.url, {
        headers: { range: "bytes=4-8" },
      });
      const headResponse = await fetch(started.url, {
        method: "HEAD",
        headers: { range: "bytes=9-12" },
      });

      expect(getResponse.status).toBe(206);
      expect(getResponse.headers.get("content-range")).toBe("bytes 4-8/16");
      expect(getResponse.headers.get("content-length")).toBe("5");
      expect(await getResponse.text()).toBe("45678");
      expect(headResponse.status).toBe(206);
      expect(headResponse.headers.get("content-range")).toBe("bytes 9-12/16");
      expect(headResponse.headers.get("content-length")).toBe("4");
      expect(await headResponse.text()).toBe("");
    });
  });

  test("serves full GET requests when FFmpeg does not ask for a range", async () => {
    await withProxy(async (started) => {
      const response = await fetch(started.url);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-length")).toBe("16");
      expect(await response.text()).toBe("0123456789abcdef");
    });
  });

  test("rejects invalid ranges and tokens", async () => {
    await withProxy(async (started) => {
      const badTokenUrl = new URL(started.url);
      badTokenUrl.searchParams.set("token", "wrong");

      const rangeResponse = await fetch(started.url, {
        headers: { range: "bytes=40-80" },
      });
      const tokenResponse = await fetch(badTokenUrl);

      expect(rangeResponse.status).toBe(416);
      expect(rangeResponse.headers.get("content-range")).toBe("bytes */16");
      expect(tokenResponse.status).toBe(403);
    });
  });
});
