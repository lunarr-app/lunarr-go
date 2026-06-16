import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  EncodeCoordinator,
  encodeJobId,
  getEncodeCoordinator,
  jobCovers,
  onEncodeCacheIdle,
  resetEncodeCoordinatorsForTests,
  type EncodeJobHandle,
} from "./encode-coordinator";

describe("encode-coordinator", () => {
  let tempDir: string;

  afterEach(async () => {
    resetEncodeCoordinatorsForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("jobCovers returns true only inside the encode window", () => {
    const job = { firstSegmentIndex: 10, lastSegmentIndex: 13 };
    expect(jobCovers(job, 9)).toBe(false);
    expect(jobCovers(job, 10)).toBe(true);
    expect(jobCovers(job, 13)).toBe(true);
    expect(jobCovers(job, 14)).toBe(false);
  });

  test("encodeJobId is stable per session and start index", () => {
    expect(encodeJobId("session-a", 5)).toContain("session-a");
    expect(encodeJobId("session-a", 5)).toBe(encodeJobId("session-a", 5));
    expect(encodeJobId("session-a", 6)).not.toBe(encodeJobId("session-a", 5));
  });

  test("ensureSegment serves from disk without starting a job", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-encode-coordinator-"));
    const segment = "segment-00005.ts";
    await writeFile(path.join(tempDir, segment), "cached");

    const segmentExists = async (name: string) => {
      try {
        await access(path.join(tempDir, name));
        return true;
      } catch {
        return false;
      }
    };

    const coordinator = new EncodeCoordinator("cache-1");
    let started = 0;
    const ready = await coordinator.ensureSegment({
      sessionId: "session-1",
      segment,
      segmentIndex: 5,
      encodeAheadSegmentCount: 4,
      segmentTimeoutMs: 500,
      segmentExists,
      assertPlayable: async () => undefined,
      startJob: async (_segmentIndex, _signal) => {
        started += 1;
        return false;
      },
    });

    expect(ready).toBe(true);
    expect(started).toBe(0);
  });

  test("ensureSegment coalesces duplicate requests for the same segment", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-encode-coordinator-"));
    const coordinator = new EncodeCoordinator("cache-1");
    let startCount = 0;
    let releaseEncode: (() => void) | undefined;
    const encodeGate = new Promise<void>((resolve) => {
      releaseEncode = resolve;
    });

    const startJob = async (_segmentIndex: number, _signal: AbortSignal): Promise<EncodeJobHandle> => {
      startCount += 1;
      const controller = new AbortController();
      const completion = (async () => {
        await encodeGate;
        await mkdir(tempDir, { recursive: true });
        await writeFile(path.join(tempDir, "segment-00002.ts"), "encoded");
      })();
      return {
        jobId: encodeJobId("session-1", 2),
        firstSegmentIndex: 2,
        lastSegmentIndex: 5,
        completion,
        abort: () => controller.abort(),
      };
    };

    const segmentExists = async (name: string) => {
      try {
        await access(path.join(tempDir, name));
        return true;
      } catch {
        return false;
      }
    };

    const first = coordinator.ensureSegment({
      sessionId: "session-1",
      segment: "segment-00002.ts",
      segmentIndex: 2,
      encodeAheadSegmentCount: 4,
      segmentTimeoutMs: 2_000,
      segmentExists,
      assertPlayable: async () => undefined,
      startJob,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = coordinator.ensureSegment({
      sessionId: "session-1",
      segment: "segment-00002.ts",
      segmentIndex: 2,
      encodeAheadSegmentCount: 4,
      segmentTimeoutMs: 2_000,
      segmentExists,
      assertPlayable: async () => undefined,
      startJob,
    });

    expect(coordinator.segmentEnsureWaiterCountForTests("segment-00002.ts")).toBe(1);
    releaseEncode?.();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(startCount).toBe(1);
  });

  test("ensureSegment unblocks waiters when a job reservation is released", async () => {
    const coordinator = new EncodeCoordinator("cache-1");
    let releaseStartJob: (() => void) | undefined;
    const startJobGate = new Promise<void>((resolve) => {
      releaseStartJob = resolve;
    });

    const segmentExists = async (_segment: string) => false;
    const startJob = async (_segmentIndex: number, _signal: AbortSignal): Promise<EncodeJobHandle | false> => {
      await startJobGate;
      return false;
    };

    const first = coordinator.ensureSegment({
      sessionId: "session-1",
      segment: "segment-00002.ts",
      segmentIndex: 2,
      encodeAheadSegmentCount: 4,
      segmentTimeoutMs: 500,
      segmentExists,
      assertPlayable: async () => undefined,
      startJob,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = coordinator.ensureSegment({
      sessionId: "session-1",
      segment: "segment-00002.ts",
      segmentIndex: 2,
      encodeAheadSegmentCount: 4,
      segmentTimeoutMs: 500,
      segmentExists,
      assertPlayable: async () => undefined,
      startJob,
    });

    releaseStartJob?.();

    await expect(
      Promise.race([
        Promise.all([first, second]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timed out waiting for reservation release")), 1_000),
        ),
      ]),
    ).resolves.toEqual([false, false]);
  });

  test("ensureSegment waits on a covering active job", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-encode-coordinator-"));
    const coordinator = new EncodeCoordinator("cache-1");
    let releaseEncode: (() => void) | undefined;
    const encodeGate = new Promise<void>((resolve) => {
      releaseEncode = resolve;
    });

    const completion = (async () => {
      await encodeGate;
      await mkdir(tempDir, { recursive: true });
      await writeFile(path.join(tempDir, "segment-00011.ts"), "encoded");
      await writeFile(path.join(tempDir, "segment-00012.ts"), "encoded");
    })();

    coordinator.registerJob({
      jobId: encodeJobId("session-1", 10),
      sessionId: "session-1",
      cacheKey: "cache-1",
      firstSegmentIndex: 10,
      lastSegmentIndex: 13,
      completion,
      abort: () => undefined,
    });

    const segmentExists = async (name: string) => {
      try {
        await access(path.join(tempDir, name));
        return true;
      } catch {
        return false;
      }
    };

    const waiting = coordinator.ensureSegment({
      sessionId: "session-1",
      segment: "segment-00012.ts",
      segmentIndex: 12,
      encodeAheadSegmentCount: 4,
      segmentTimeoutMs: 2_000,
      segmentExists,
      assertPlayable: async () => undefined,
      startJob: async (_segmentIndex, _signal) => {
        throw new Error("should not start a second job");
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseEncode?.();
    expect(await waiting).toBe(true);
  });

  test("ensureSegment starts a new job when a covering job completes without the requested segment", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-encode-coordinator-"));
    const coordinator = new EncodeCoordinator("cache-1");
    let startCount = 0;
    let failLookahead: () => void = () => undefined;
    const lookaheadFailure = new Promise<void>((_, reject) => {
      failLookahead = () => reject(new Error("lookahead failed"));
    });

    const segmentExists = async (name: string) => {
      try {
        await access(path.join(tempDir, name));
        return true;
      } catch {
        return false;
      }
    };

    const startJob = async (segmentIndex: number, _signal: AbortSignal): Promise<EncodeJobHandle> => {
      startCount += 1;
      const controller = new AbortController();
      const segment = `segment-${String(segmentIndex).padStart(5, "0")}.ts`;
      const completion = (async () => {
        if (startCount === 1) {
          await mkdir(tempDir, { recursive: true });
          await writeFile(path.join(tempDir, "segment-00010.ts"), "requested");
          await lookaheadFailure;
          return;
        }
        await writeFile(path.join(tempDir, segment), "retried");
      })();
      return {
        jobId: encodeJobId("session-1", segmentIndex),
        firstSegmentIndex: segmentIndex,
        lastSegmentIndex: segmentIndex + 3,
        completion,
        abort: () => controller.abort(),
      };
    };

    const first = coordinator.ensureSegment({
      sessionId: "session-1",
      segment: "segment-00010.ts",
      segmentIndex: 10,
      encodeAheadSegmentCount: 4,
      segmentTimeoutMs: 2_000,
      segmentExists,
      assertPlayable: async () => undefined,
      startJob: (segmentIndex, _signal) => startJob(segmentIndex, _signal),
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(startCount).toBe(1);
    expect(await segmentExists("segment-00010.ts")).toBe(true);

    const secondPromise = coordinator.ensureSegment({
      sessionId: "session-1",
      segment: "segment-00011.ts",
      segmentIndex: 11,
      encodeAheadSegmentCount: 4,
      segmentTimeoutMs: 2_000,
      segmentExists,
      assertPlayable: async () => undefined,
      startJob: (segmentIndex, _signal) => startJob(segmentIndex, _signal),
    });

    failLookahead();
    expect(await first).toBe(true);
    expect(await secondPromise).toBe(true);
    expect(startCount).toBe(2);
    expect(await segmentExists("segment-00011.ts")).toBe(true);
  });

  test("ensureSegment cancels stale session jobs outside the requested segment", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-encode-coordinator-"));
    const coordinator = new EncodeCoordinator("cache-1");
    let farAborted = false;

    coordinator.registerJob({
      jobId: encodeJobId("session-1", 30),
      sessionId: "session-1",
      cacheKey: "cache-1",
      firstSegmentIndex: 30,
      lastSegmentIndex: 33,
      completion: new Promise(() => undefined),
      abort: () => {
        farAborted = true;
      },
    });

    const segmentExists = async (_segment: string) => false;
    await coordinator.ensureSegment({
      sessionId: "session-1",
      segment: "segment-00011.ts",
      segmentIndex: 11,
      encodeAheadSegmentCount: 4,
      segmentTimeoutMs: 100,
      segmentExists,
      assertPlayable: async () => undefined,
      startJob: async (_segmentIndex, _signal) => false,
    });

    expect(farAborted).toBe(true);
  });

  test("prefetchAhead starts at the first missing segment in range", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-encode-coordinator-"));
    const coordinator = new EncodeCoordinator("cache-1");
    await mkdir(tempDir, { recursive: true });
    await writeFile(path.join(tempDir, "segment-00001.ts"), "cached");

    const ensured: number[] = [];
    const ready = await coordinator.prefetchAhead({
      sessionId: "session-1",
      servedSegmentIndex: 0,
      lastSegmentIndex: 10,
      segmentFormat: "mpegts",
      encodeAheadSegmentCount: 4,
      segmentExists: async (_index, name) => {
        try {
          await access(path.join(tempDir, name));
          return true;
        } catch {
          return false;
        }
      },
      ensureSegmentAt: async (index) => {
        ensured.push(index);
        return true;
      },
    });

    expect(ready).toBe(true);
    expect(ensured).toEqual([2]);
  });

  test("onNoActiveViewers aborts all jobs and clears pending ensures", async () => {
    const coordinator = new EncodeCoordinator("cache-1");
    let aborted = false;
    coordinator.registerJob({
      jobId: encodeJobId("session-1", 0),
      sessionId: "session-1",
      cacheKey: "cache-1",
      firstSegmentIndex: 0,
      lastSegmentIndex: 3,
      completion: new Promise(() => undefined),
      abort: () => {
        aborted = true;
      },
    });

    coordinator.onNoActiveViewers();
    expect(aborted).toBe(true);
    expect(coordinator.activeJobCountForTests()).toBe(0);
  });

  test("ensureSegment returns false after max reservation retries", async () => {
    const coordinator = new EncodeCoordinator("cache-1");
    let startCount = 0;
    const segmentExists = async () => false;

    const startJob = async (segmentIndex: number, _signal: AbortSignal): Promise<EncodeJobHandle | false> => {
      startCount += 1;
      if (segmentIndex === 11) {
        void coordinator.ensureSegment({
          sessionId: "session-1",
          segment: "segment-00030.ts",
          segmentIndex: 30,
          encodeAheadSegmentCount: 4,
          segmentTimeoutMs: 100,
          segmentExists,
          assertPlayable: async () => undefined,
          startJob: async () => false,
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return false;
    };

    const result = await coordinator.ensureSegment({
      sessionId: "session-1",
      segment: "segment-00011.ts",
      segmentIndex: 11,
      encodeAheadSegmentCount: 4,
      segmentTimeoutMs: 500,
      segmentExists,
      assertPlayable: async () => undefined,
      startJob,
    });

    expect(result).toBe(false);
    expect(startCount).toBe(8);
  });

  test("onEncodeCacheIdle drops coordinator for encode-directory-only keys", () => {
    const cacheKey = "/tmp/encode-only-dir";
    const coordinator = getEncodeCoordinator(cacheKey);
    coordinator.registerJob({
      jobId: encodeJobId("session-1", 0),
      sessionId: "session-1",
      cacheKey,
      firstSegmentIndex: 0,
      lastSegmentIndex: 3,
      completion: new Promise(() => undefined),
      abort: () => undefined,
    });
    expect(coordinator.activeJobCountForTests()).toBe(1);
    onEncodeCacheIdle(cacheKey);
    expect(getEncodeCoordinator(cacheKey).activeJobCountForTests()).toBe(0);
  });
});
