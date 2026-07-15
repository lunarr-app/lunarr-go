import path from "node:path";
import { resolveEncodeAheadSegmentCount } from "./hls";

const SEGMENT_POLL_MS = 25;

export type EncodeJobId = string;

export type ActiveEncodeJob = {
  jobId: EncodeJobId;
  sessionId: string;
  cacheKey: string;
  firstSegmentIndex: number;
  lastSegmentIndex: number;
  completion: Promise<void>;
  abort: () => void;
  cancelledBySessionSeek?: boolean;
  cancelledForSegmentIndex?: number;
};

export type EncodeJobHandle = {
  jobId: EncodeJobId;
  firstSegmentIndex: number;
  lastSegmentIndex: number;
  completion: Promise<void>;
  abort: () => void;
};

export function encodeJobId(sessionId: string, firstSegmentIndex: number): EncodeJobId {
  return `${sessionId}\0${firstSegmentIndex}`;
}

export function encodeLockKey(cacheId: string | null, encodeDirectory: string) {
  return cacheId ?? encodeDirectory;
}

export function encodeEventPlaylistPath(artifactDirectory: string, sessionId: string, startSegmentIndex: number) {
  return path.join(artifactDirectory, `encode-${encodeJobId(sessionId, startSegmentIndex).replace(/\0/g, "-")}.m3u8`);
}

export function encodeFmp4InitFileName(sessionId: string, startSegmentIndex: number) {
  return `encode-${encodeJobId(sessionId, startSegmentIndex).replace(/\0/g, "-")}-init.mp4`;
}

export function jobCovers(job: Pick<ActiveEncodeJob, "firstSegmentIndex" | "lastSegmentIndex">, segmentIndex: number) {
  return segmentIndex >= job.firstSegmentIndex && segmentIndex <= job.lastSegmentIndex;
}

export type EnsureSegmentInput = {
  sessionId: string;
  segment: string;
  segmentIndex: number;
  signal?: AbortSignal;
  encodeAheadSegmentCount: number;
  segmentTimeoutMs: number;
  segmentExists: (segment: string) => Promise<boolean>;
  assertPlayable: () => Promise<void>;
  startJob: (segmentIndex: number, signal: AbortSignal) => Promise<EncodeJobHandle | false>;
};

function ensureKey(cacheKey: string, segment: string) {
  return `${cacheKey}\0${segment}`;
}

function shouldGiveUpAfterSessionSeekCancel(
  ensuringSegmentIndex: number,
  job: Pick<ActiveEncodeJob, "cancelledBySessionSeek" | "cancelledForSegmentIndex">,
) {
  return (
    job.cancelledBySessionSeek === true &&
    job.cancelledForSegmentIndex !== undefined &&
    ensuringSegmentIndex > job.cancelledForSegmentIndex
  );
}

class EncodeReservationReleasedError extends Error {
  constructor() {
    super("Encode job reservation released.");
    this.name = "EncodeReservationReleasedError";
  }
}

function isAbortError(error: unknown) {
  if (error instanceof EncodeReservationReleasedError) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("aborted") ||
    message.includes("replaced") ||
    message.includes("cancelled") ||
    message.includes("canceled")
  );
}

async function rethrowCompletionUnlessAborted(completion: Promise<void>) {
  try {
    await completion;
  } catch (error) {
    if (!isAbortError(error)) throw error;
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

async function waitForSegmentFile(input: {
  segmentExists: () => Promise<boolean>;
  completion: Promise<void>;
  signal?: AbortSignal;
  timeoutMs: number;
}) {
  let completionError: unknown;
  input.completion.catch((error) => {
    completionError = error;
  });

  const settleOrThrow = async (): Promise<false | undefined> => {
    if (input.signal?.aborted) {
      await rethrowCompletionUnlessAborted(input.completion);
      if (completionError && !isAbortError(completionError)) throw completionError;
      return false;
    }
    if (completionError) {
      if (isAbortError(completionError)) return false;
      throw completionError;
    }
    return undefined;
  };

  const deadline = Date.now() + Math.max(0, input.timeoutMs);
  let completed = false;
  input.completion
    .then(() => {
      completed = true;
    })
    .catch(() => {
      completed = true;
    });

  while (Date.now() <= deadline) {
    const result = await settleOrThrow();
    if (result === false) return false;
    if (await input.segmentExists()) return true;
    if (completed) break;
    await delay(SEGMENT_POLL_MS, input.signal);
  }

  const result = await settleOrThrow();
  if (result === false) return false;
  return await input.segmentExists();
}

export class EncodeCoordinator {
  private jobs: ActiveEncodeJob[] = [];
  private ensurePromises = new Map<string, Promise<boolean>>();
  private ensureWaiters = new Map<string, number>();

  constructor(readonly cacheKey: string) {}

  activeJobCountForTests(sessionId?: string) {
    if (!sessionId) return this.jobs.length;
    return this.jobs.filter((job) => job.sessionId === sessionId).length;
  }

  segmentEnsureWaiterCountForTests(segment: string) {
    return this.ensureWaiters.get(ensureKey(this.cacheKey, segment)) ?? 0;
  }

  findCoveringJob(segmentIndex: number) {
    return this.jobs.find((job) => jobCovers(job, segmentIndex));
  }

  private removeJob(jobId: EncodeJobId) {
    this.jobs = this.jobs.filter((entry) => entry.jobId !== jobId);
  }

  private wireJobCleanup(job: ActiveEncodeJob) {
    void job.completion
      .finally(() => {
        this.removeJob(job.jobId);
      })
      .catch(() => undefined);
  }

  reserveCoveringJob(input: {
    sessionId: string;
    segmentIndex: number;
    encodeAheadSegmentCount: number;
    completion: Promise<void>;
    abort: () => void;
  }): ActiveEncodeJob {
    const ahead = resolveEncodeAheadSegmentCount(input.encodeAheadSegmentCount);
    const job: ActiveEncodeJob = {
      jobId: encodeJobId(input.sessionId, input.segmentIndex),
      sessionId: input.sessionId,
      cacheKey: this.cacheKey,
      firstSegmentIndex: input.segmentIndex,
      lastSegmentIndex: input.segmentIndex + ahead - 1,
      completion: input.completion,
      abort: input.abort,
    };
    this.jobs.push(job);
    return job;
  }

  cancelSessionJobsOutsideSegment(sessionId: string, segmentIndex: number) {
    for (const job of [...this.jobs]) {
      if (job.sessionId !== sessionId) continue;
      if (jobCovers(job, segmentIndex)) continue;
      job.cancelledBySessionSeek = true;
      job.cancelledForSegmentIndex = segmentIndex;
      job.abort();
    }
  }

  onSessionEnded(sessionId: string) {
    for (const job of [...this.jobs]) {
      if (job.sessionId !== sessionId) continue;
      job.abort();
    }
  }

  onNoActiveViewers() {
    for (const job of [...this.jobs]) {
      job.abort();
    }
    this.jobs = [];
    this.ensurePromises.clear();
    this.ensureWaiters.clear();
  }

  async ensureSegment(input: EnsureSegmentInput): Promise<boolean> {
    if (input.signal?.aborted) return false;

    const key = ensureKey(this.cacheKey, input.segment);
    const pending = this.ensurePromises.get(key);
    if (pending) {
      this.ensureWaiters.set(key, (this.ensureWaiters.get(key) ?? 0) + 1);
      try {
        return await pending;
      } finally {
        const remaining = (this.ensureWaiters.get(key) ?? 1) - 1;
        if (remaining <= 0) this.ensureWaiters.delete(key);
        else this.ensureWaiters.set(key, remaining);
      }
    }

    const run = this.runEnsureSegment(input);
    this.ensurePromises.set(key, run);
    run
      .finally(() => {
        if (this.ensurePromises.get(key) === run) {
          this.ensurePromises.delete(key);
        }
      })
      .catch(() => undefined);
    return run;
  }

  private async runEnsureSegment(input: EnsureSegmentInput): Promise<boolean> {
    if (input.signal?.aborted) return false;
    if (await input.segmentExists(input.segment)) return true;

    this.cancelSessionJobsOutsideSegment(input.sessionId, input.segmentIndex);

    for (;;) {
      const covering = this.findCoveringJob(input.segmentIndex);
      if (!covering) break;

      let ready = false;
      try {
        ready = await waitForSegmentFile({
          segmentExists: () => input.segmentExists(input.segment),
          completion: covering.completion,
          signal: input.signal,
          timeoutMs: input.segmentTimeoutMs,
        });
      } catch (error) {
        if (isAbortError(error)) return false;
        break;
      }
      if (input.signal?.aborted) return false;
      if (ready && (await input.segmentExists(input.segment))) {
        await input.assertPlayable();
        return true;
      }

      let completionAborted = false;
      let completionFailed = false;
      try {
        await covering.completion;
      } catch (error) {
        if (isAbortError(error)) {
          completionAborted = true;
        } else {
          completionFailed = true;
        }
      }
      if (await input.segmentExists(input.segment)) {
        await input.assertPlayable();
        return true;
      }
      if (!completionFailed && !completionAborted) {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (await input.segmentExists(input.segment)) {
            await input.assertPlayable();
            return true;
          }
          await delay(SEGMENT_POLL_MS);
        }
      }
      if (input.signal?.aborted) return false;
      if (completionAborted) {
        if (covering.cancelledBySessionSeek && covering.sessionId === input.sessionId) {
          return false;
        }
        this.removeJob(covering.jobId);
        break;
      }
      if (completionFailed) {
        covering.abort();
        this.removeJob(covering.jobId);
        break;
      }
      if (!this.findCoveringJob(input.segmentIndex)) break;
    }

    if (await input.segmentExists(input.segment)) {
      await input.assertPlayable();
      return true;
    }

    for (let reservationAttempt = 0; reservationAttempt < 8; reservationAttempt += 1) {
      if (input.signal?.aborted) return false;
      if (await input.segmentExists(input.segment)) {
        await input.assertPlayable();
        return true;
      }

      const jobController = new AbortController();
      const abortFromRequest = () => jobController.abort();
      input.signal?.addEventListener("abort", abortFromRequest, { once: true });

      let resolveReservedCompletion: (() => void) | undefined;
      let rejectReservedCompletion: ((error: Error) => void) | undefined;
      const releaseReservation = (error?: Error) => {
        if (!resolveReservedCompletion && !rejectReservedCompletion) return;
        const resolve = resolveReservedCompletion;
        const reject = rejectReservedCompletion;
        resolveReservedCompletion = undefined;
        rejectReservedCompletion = undefined;
        if (error) reject?.(error);
        else resolve?.();
      };
      const reservedCompletion = new Promise<void>((resolve, reject) => {
        resolveReservedCompletion = resolve;
        rejectReservedCompletion = reject;
      });
      reservedCompletion.catch(() => undefined);
      const reservedJob = this.reserveCoveringJob({
        sessionId: input.sessionId,
        segmentIndex: input.segmentIndex,
        encodeAheadSegmentCount: input.encodeAheadSegmentCount,
        completion: reservedCompletion,
        abort: () => {
          jobController.abort();
          releaseReservation(new EncodeReservationReleasedError());
        },
      });

      let started: EncodeJobHandle | false;
      try {
        started = await input.startJob(input.segmentIndex, jobController.signal);
      } catch (error) {
        this.removeJob(reservedJob.jobId);
        releaseReservation(error instanceof Error ? error : new Error(String(error)));
        throw error;
      } finally {
        input.signal?.removeEventListener("abort", abortFromRequest);
      }

      if (input.signal?.aborted) {
        if (started) started.abort();
        releaseReservation(new EncodeReservationReleasedError());
        this.removeJob(reservedJob.jobId);
        return false;
      }
      if (!started) {
        releaseReservation(new EncodeReservationReleasedError());
        const seekCancel = {
          cancelledBySessionSeek: reservedJob.cancelledBySessionSeek,
          cancelledForSegmentIndex: reservedJob.cancelledForSegmentIndex,
        };
        this.removeJob(reservedJob.jobId);
        if (jobController.signal.aborted) {
          if (
            shouldGiveUpAfterSessionSeekCancel(input.segmentIndex, seekCancel) &&
            reservedJob.sessionId === input.sessionId
          ) {
            return false;
          }
          continue;
        }
        return false;
      }

      void started.completion.then(
        () => releaseReservation(),
        (error) => releaseReservation(error instanceof Error ? error : new Error(String(error))),
      );

      reservedJob.jobId = started.jobId;
      reservedJob.firstSegmentIndex = started.firstSegmentIndex;
      reservedJob.lastSegmentIndex = started.lastSegmentIndex;
      reservedJob.completion = started.completion;
      reservedJob.abort = started.abort;
      this.wireJobCleanup(reservedJob);

      const ready = await waitForSegmentFile({
        segmentExists: () => input.segmentExists(input.segment),
        completion: started.completion,
        signal: input.signal,
        timeoutMs: input.segmentTimeoutMs,
      });
      if (input.signal?.aborted) {
        started.abort();
        await rethrowCompletionUnlessAborted(started.completion);
        return false;
      }
      if (!ready || !(await input.segmentExists(input.segment))) {
        const seekCancel = {
          cancelledBySessionSeek: reservedJob.cancelledBySessionSeek,
          cancelledForSegmentIndex: reservedJob.cancelledForSegmentIndex,
        };
        let completionAborted = false;
        try {
          await started.completion;
        } catch (error) {
          if (isAbortError(error)) {
            completionAborted = true;
          } else {
            throw error;
          }
        }
        if (await input.segmentExists(input.segment)) {
          await input.assertPlayable();
          return true;
        }
        if (input.signal?.aborted) return false;
        if (completionAborted) {
          if (seekCancel.cancelledBySessionSeek && reservedJob.sessionId === input.sessionId) {
            return false;
          }
          continue;
        }
        throw new Error(`Request-driven HLS segment generation completed without publishing ${input.segment}.`);
      }
      await input.assertPlayable();
      return true;
    }

    console.warn(`Encode coordinator exhausted reservation retries for ${input.segment} on cache ${this.cacheKey}.`);
    return false;
  }

  async prefetchAhead(input: {
    sessionId: string;
    servedSegmentIndex: number;
    lastSegmentIndex: number;
    segmentFormat: "mpegts" | "fmp4";
    encodeAheadSegmentCount: number;
    signal?: AbortSignal;
    segmentExists: (segmentIndex: number, segmentName: string) => Promise<boolean>;
    ensureSegmentAt: (segmentIndex: number, segmentName: string) => Promise<boolean>;
  }): Promise<boolean> {
    const ahead = resolveEncodeAheadSegmentCount(input.encodeAheadSegmentCount);
    const coveringServedJob = this.findCoveringJob(input.servedSegmentIndex);
    const targetIndex = Math.min(
      input.lastSegmentIndex,
      input.servedSegmentIndex + ahead,
      coveringServedJob?.lastSegmentIndex ?? input.servedSegmentIndex + ahead,
    );
    if (targetIndex <= input.servedSegmentIndex) return true;

    for (let candidateIndex = input.servedSegmentIndex + 1; candidateIndex <= targetIndex; candidateIndex += 1) {
      if (input.signal?.aborted) return false;
      const segmentName =
        input.segmentFormat === "fmp4"
          ? `segment-${String(candidateIndex).padStart(5, "0")}.m4s`
          : `segment-${String(candidateIndex).padStart(5, "0")}.ts`;
      if (await input.segmentExists(candidateIndex, segmentName)) continue;
      if (this.findCoveringJob(candidateIndex)) continue;
      const ready = await input.ensureSegmentAt(candidateIndex, segmentName);
      if (!ready) return false;
      break;
    }

    return true;
  }
}

const coordinators = new Map<string, EncodeCoordinator>();

export function getEncodeCoordinator(cacheKey: string) {
  let coordinator = coordinators.get(cacheKey);
  if (!coordinator) {
    coordinator = new EncodeCoordinator(cacheKey);
    coordinators.set(cacheKey, coordinator);
  }
  return coordinator;
}

export function resetEncodeCoordinatorsForTests() {
  for (const coordinator of coordinators.values()) {
    coordinator.onNoActiveViewers();
  }
  coordinators.clear();
}

export function onEncodeCacheIdle(cacheKey: string) {
  const coordinator = coordinators.get(cacheKey);
  coordinator?.onNoActiveViewers();
  coordinators.delete(cacheKey);
}

export function onEncodeSessionEnded(sessionId: string) {
  for (const coordinator of coordinators.values()) {
    coordinator.onSessionEnded(sessionId);
  }
}
