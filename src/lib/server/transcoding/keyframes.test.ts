import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  extractKeyframeTimes,
  keyframeCachePath,
  keyframeScanStrategyForFormat,
  readKeyframeCache,
  writeKeyframeCache,
  type KeyframeExtractorDeps,
} from "./keyframes";
import type { NodeAvInputFormat } from "./container-format";
import type { SeekableTranscodeInputSource } from "./backend";

describe("keyframeScanStrategyForFormat", () => {
  test.each<[NodeAvInputFormat | null, "scan" | "skip"]>([
    ["mp4", "scan"],
    ["webm", "scan"],
    ["matroska", "scan"],
    ["avi", "skip"],
    ["mpegts", "skip"],
    [null, "skip"],
  ])("classifies %s as %s", (format, expected) => {
    expect(keyframeScanStrategyForFormat(format)).toBe(expected);
  });
});

describe("keyframe cache", () => {
  test("readKeyframeCache returns null when the file is absent", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-keyframes-absent-"));
    try {
      expect(await readKeyframeCache(tempDir)).toBeNull();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("writeKeyframeCache round-trips an array of keyframe times", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-keyframes-roundtrip-"));
    try {
      const times = [0, 16.5, 33.1, 50.0];
      await writeKeyframeCache(tempDir, times);
      expect(await readKeyframeCache(tempDir)).toEqual(times);

      const raw = JSON.parse(await readFile(keyframeCachePath(tempDir), "utf8"));
      expect(raw.keyframeTimes).toEqual(times);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("readKeyframeCache filters out non-finite or negative values", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-keyframes-bad-"));
    try {
      await mkdir(tempDir, { recursive: true });
      await writeFile(
        keyframeCachePath(tempDir),
        JSON.stringify({ keyframeTimes: [0, -1, Number.NaN, 16, "broken", Number.POSITIVE_INFINITY, 32] }),
      );
      expect(await readKeyframeCache(tempDir)).toEqual([0, 16, 32]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("readKeyframeCache returns null when payload is malformed", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-keyframes-malformed-"));
    try {
      await mkdir(tempDir, { recursive: true });
      await writeFile(keyframeCachePath(tempDir), "not-json{}");
      expect(await readKeyframeCache(tempDir)).toBeNull();

      await writeFile(keyframeCachePath(tempDir), JSON.stringify({ keyframeTimes: "nope" }));
      expect(await readKeyframeCache(tempDir)).toBeNull();

      await writeFile(keyframeCachePath(tempDir), JSON.stringify({ keyframeTimes: [] }));
      expect(await readKeyframeCache(tempDir)).toBeNull();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("writeKeyframeCache never throws when the cache directory is unavailable", async () => {
    await expect(writeKeyframeCache("/no/such/dir/here", [0, 16])).resolves.toBeUndefined();
  });
});

describe("extractKeyframeTimes", () => {
  function makeFakeDeps(probeKeyframes: KeyframeExtractorDeps["probeKeyframes"]): KeyframeExtractorDeps {
    return { probeKeyframes };
  }

  test("returns null when the format is not scannable", async () => {
    const deps = makeFakeDeps(async () => [0]);
    const result = await extractKeyframeTimes(deps, {
      mediaFileId: "file-1",
      filePath: "/tmp/movie.ts",
      format: "mpegts",
    });
    expect(result).toBeNull();
  });

  test("returns null when the probe backend resolves null", async () => {
    const deps = makeFakeDeps(async () => null);
    const result = await extractKeyframeTimes(deps, {
      mediaFileId: "file-1",
      filePath: "/tmp/movie.mp4",
      format: "mp4",
    });
    expect(result).toBeNull();
  });

  test("forwards the resolved keyframe times when the probe succeeds", async () => {
    const expected = [0, 16.5, 33.1];
    const deps = makeFakeDeps(async ({ path }) => {
      expect(path).toBe("/tmp/movie.mp4");
      return expected;
    });
    const result = await extractKeyframeTimes(deps, {
      mediaFileId: "file-1",
      filePath: "/tmp/movie.mp4",
      format: "mp4",
      timeoutMs: 5_000,
    });
    expect(result).toEqual(expected);
  });

  test("returns null when the probe rejects", async () => {
    const deps = makeFakeDeps(async () => {
      throw new Error("boom");
    });
    const result = await extractKeyframeTimes(deps, {
      mediaFileId: "file-1",
      filePath: "/tmp/movie.webm",
      format: "webm",
    });
    expect(result).toBeNull();
  });

  test("passes through the input source when provided", async () => {
    const fakeInputSource: SeekableTranscodeInputSource = {
      kind: "seekable",
      label: "test://movie.mp4",
      sizeBytes: 1,
      format: "mp4",
      read: async () => Buffer.alloc(0),
      close: async () => undefined,
    };
    const seen: Array<SeekableTranscodeInputSource | undefined> = [];
    const deps = makeFakeDeps(async ({ inputSource }) => {
      seen.push(inputSource);
      return [0, 16];
    });
    await extractKeyframeTimes(deps, {
      mediaFileId: "file-1",
      filePath: "/tmp/movie.mp4",
      inputSource: fakeInputSource,
      format: "mp4",
    });
    expect(seen).toEqual([fakeInputSource]);
  });

  test("returns null on timeout without resolving the underlying promise", async () => {
    let resolveLater: (value: number[] | null) => void = () => undefined;
    const deps = makeFakeDeps(
      () =>
        new Promise((resolve) => {
          resolveLater = resolve;
        }),
    );
    const result = await extractKeyframeTimes(deps, {
      mediaFileId: "file-1",
      filePath: "/tmp/movie.mp4",
      format: "mp4",
      timeoutMs: 5,
    });
    expect(result).toBeNull();
    // Allow the late resolve to fire without affecting the caller.
    resolveLater([0, 16]);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  test("aborts the probe when the caller signal aborts", async () => {
    const controller = new AbortController();
    const seenSignals: AbortSignal[] = [];
    const deps = makeFakeDeps(async ({ signal }) => {
      seenSignals.push(signal!);
      // Block until aborted.
      return new Promise<number[] | null>(() => undefined);
    });
    const promise = extractKeyframeTimes(deps, {
      mediaFileId: "file-1",
      filePath: "/tmp/movie.mp4",
      format: "mp4",
      signal: controller.signal,
      timeoutMs: 60_000,
    });
    controller.abort();
    const result = await promise;
    expect(result).toBeNull();
    expect(seenSignals.length).toBe(1);
    expect(seenSignals[0]?.aborted).toBe(true);
  });
});
