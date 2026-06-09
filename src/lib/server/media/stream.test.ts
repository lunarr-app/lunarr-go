import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  inlineContentDisposition,
  parseRange,
  streamFileHeadResponse,
  streamFileResponse,
} from "./stream";

describe("parseRange", () => {
  test("parses explicit byte ranges", () => {
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
  });

  test("clamps explicit byte ranges to file size", () => {
    expect(parseRange("bytes=8-99", 10)).toEqual({ start: 8, end: 9 });
  });

  test("parses open-ended ranges", () => {
    expect(parseRange("bytes=95-", 100)).toEqual({ start: 95, end: 99 });
  });

  test("parses suffix ranges", () => {
    expect(parseRange("bytes=-25", 100)).toEqual({ start: 75, end: 99 });
  });

  test("rejects unsatisfiable ranges", () => {
    expect(parseRange("bytes=100-120", 100)).toBeNull();
    expect(parseRange("bytes=40-20", 100)).toBeNull();
    expect(parseRange("bytes=-25", 0)).toBeNull();
    expect(parseRange("bytes=0-1,3-4", 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
  });

  test("sanitizes inline content disposition filenames", () => {
    expect(inlineContentDisposition('A "Movie"\r\nBad.mp4')).toBe(
      'inline; filename="A MovieBad.mp4"',
    );
    expect(inlineContentDisposition("\u0000")).toBe('inline; filename="file"');
  });
});

describe("streamFileResponse", () => {
  async function withMediaFile(
    run: (file: {
      path: string;
      basename: string;
      extension: string;
    }) => Promise<void>,
  ) {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-stream-"));
    try {
      const file = {
        path: path.join(dir, "Movie.mp4"),
        basename: "Movie.mp4",
        extension: ".mp4",
      };
      await writeFile(file.path, "0123456789");
      await run(file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  test("streams a full file with browser-video headers", async () => {
    await withMediaFile(async (file) => {
      const response = await streamFileResponse(file, null);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("video/mp4");
      expect(response.headers.get("content-length")).toBe("10");
      expect(response.headers.get("accept-ranges")).toBe("bytes");
      expect(response.headers.get("content-disposition")).toBe(
        'inline; filename="Movie.mp4"',
      );
      expect(await response.text()).toBe("0123456789");
    });
  });

  test("streams a satisfiable byte range", async () => {
    await withMediaFile(async (file) => {
      const response = await streamFileResponse(file, "bytes=2-5");

      expect(response.status).toBe(206);
      expect(response.headers.get("content-length")).toBe("4");
      expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
      expect(await response.text()).toBe("2345");
    });
  });

  test("returns 416 for unsatisfiable ranges", async () => {
    await withMediaFile(async (file) => {
      const response = await streamFileResponse(file, "bytes=50-60");

      expect(response.status).toBe(416);
      expect(response.headers.get("content-range")).toBe("bytes */10");
      expect(response.headers.get("accept-ranges")).toBe("bytes");
    });
  });

  test("returns 416 for ranged requests against empty files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-stream-empty-"));
    try {
      const file = {
        path: path.join(dir, "Empty.mp4"),
        basename: "Empty.mp4",
        extension: ".mp4",
      };
      await writeFile(file.path, "");

      const response = await streamFileResponse(file, "bytes=0-1");

      expect(response.status).toBe(416);
      expect(response.headers.get("content-range")).toBe("bytes */0");
      expect(response.headers.get("accept-ranges")).toBe("bytes");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("returns 404 for paths that are not regular files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-stream-directory-"));
    try {
      const directoryPath = path.join(dir, "Movie.mp4");
      await mkdir(directoryPath);

      const response = await streamFileResponse(
        {
          path: directoryPath,
          basename: "Movie.mp4",
          extension: ".mp4",
        },
        null,
      );

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Media file is no longer available");

      const headResponse = await streamFileHeadResponse(
        {
          path: directoryPath,
          basename: "Movie.mp4",
          extension: ".mp4",
        },
        null,
      );
      expect(headResponse.status).toBe(404);
      expect(headResponse.body).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("returns full-file headers without a body for HEAD requests", async () => {
    await withMediaFile(async (file) => {
      const response = await streamFileHeadResponse(file, null);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("video/mp4");
      expect(response.headers.get("content-length")).toBe("10");
      expect(response.headers.get("accept-ranges")).toBe("bytes");
      expect(response.body).toBeNull();
    });
  });

  test("returns range headers without a body for ranged HEAD requests", async () => {
    await withMediaFile(async (file) => {
      const response = await streamFileHeadResponse(file, "bytes=2-5");

      expect(response.status).toBe(206);
      expect(response.headers.get("content-length")).toBe("4");
      expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
      expect(response.body).toBeNull();
    });
  });

  test("returns 416 headers without a body for unsatisfiable HEAD ranges", async () => {
    await withMediaFile(async (file) => {
      const response = await streamFileHeadResponse(file, "bytes=50-60");

      expect(response.status).toBe(416);
      expect(response.headers.get("content-range")).toBe("bytes */10");
      expect(response.headers.get("accept-ranges")).toBe("bytes");
      expect(response.body).toBeNull();
    });
  });
});
