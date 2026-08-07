import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { createLibrary } from "../libraries";
import type { ProbeBackend } from "../transcoding/backend";
import {
  cancelScanJob,
  createScanJob,
  resumeInterruptedJobs,
  runScanJob,
  startAllMovieScans,
  startScan,
} from "./scan-jobs";

let tempDir: string;
let db: Kysely<Database>;
let library: { id: string };
async function waitForScanJob(jobId: string, status: "completed" | "failed" | "cancelled" = "completed") {
  for (let index = 0; index < 50; index += 1) {
    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    if (job.status === status) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
}

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-scanner-jobs-"));
  const mediaDir = path.join(tempDir, "movies");
  await mkdir(mediaDir);
  await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
  await migrateDatabase();
  db = await getDb();

  library = await createLibrary({
    name: "Movies",
    kind: "movie",
    path: mediaDir,
  });
});

afterAll(async () => {
  await closeDatabaseForTests();
  await rm(tempDir, { recursive: true, force: true });
});

describe("runScanJob", () => {
  test("reuses an active scan job instead of enqueueing duplicates", async () => {
    const activeJobId = await createScanJob(library.id);
    const returnedJobId = await startScan(library.id);

    expect(returnedJobId).toBe(activeJobId);

    const activeJobs = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("library_id", "=", library.id)
      .where("status", "in", ["queued", "running"])
      .execute();
    expect(activeJobs).toHaveLength(1);

    await db
      .updateTable("scan_job")
      .set({ status: "cancelled", finished_at: new Date().toISOString() })
      .where("id", "=", activeJobId)
      .execute();
  });

  test("ignores duplicate scan runners for the same job id", async () => {
    const mediaDir = path.join(tempDir, "duplicate-runner");
    await mkdir(mediaDir, { recursive: true });
    const moviePath = path.join(mediaDir, "Single.Runner.2026.mp4");
    await writeFile(moviePath, "movie");
    const runnerLibrary = await createLibrary({
      name: "Duplicate Runner",
      kind: "movie",
      path: mediaDir,
    });
    const jobId = await createScanJob(runnerLibrary.id);
    let walkStarts = 0;
    let releaseWalk: () => void = () => {};
    const walkPaused = new Promise<void>((resolve) => {
      releaseWalk = resolve;
    });
    const options = {
      metadataMatcher: async () => null,
      async *fileWalker() {
        walkStarts += 1;
        await walkPaused;
        yield {
          kind: "file" as const,
          path: moviePath,
          file: {
            path: moviePath,
            basename: "Single.Runner.2026.mp4",
            extension: ".mp4",
            size: 10,
            mtimeMs: Date.now(),
          },
        };
      },
    };

    const firstRun = runScanJob(jobId, options);
    await runScanJob(jobId, options);
    for (let index = 0; index < 20 && walkStarts === 0; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(walkStarts).toBe(1);
    releaseWalk();
    await firstRun;

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_added: 1,
    });

    await db.deleteFrom("library").where("id", "=", runnerLibrary.id).execute();
  });

  test("runs one follow-up scan when a scan is requested during an active scan", async () => {
    const mediaDir = path.join(tempDir, "active-rescan");
    await mkdir(mediaDir, { recursive: true });
    const moviePath = path.join(mediaDir, "Active.Rescan.2026.mp4");
    await writeFile(moviePath, "movie");
    const rescanLibrary = await createLibrary({
      name: "Active Rescan",
      kind: "movie",
      path: mediaDir,
    });
    const jobId = await createScanJob(rescanLibrary.id);
    let releaseFirstScan: () => void = () => {};
    const firstScanPaused = new Promise<void>((resolve) => {
      releaseFirstScan = resolve;
    });
    let walkStarts = 0;

    const options = {
      metadataMatcher: async () => null,
      async *fileWalker() {
        walkStarts += 1;
        yield { kind: "file" as const, path: moviePath };
        if (walkStarts === 1) await firstScanPaused;
      },
    };
    const scanPromise = runScanJob(jobId, options);

    let activeJob = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    for (let index = 0; index < 20 && activeJob.files_seen < 1; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeJob = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    }

    expect(await startScan(rescanLibrary.id, options)).toBe(jobId);
    activeJob = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(activeJob.rescan_requested_at).not.toBeNull();

    releaseFirstScan();
    await scanPromise;

    let jobs = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("library_id", "=", rescanLibrary.id)
      .orderBy("created_at", "asc")
      .execute();
    for (
      let index = 0;
      index < 20 && (jobs.length < 2 || jobs.some((job) => job.status === "queued" || job.status === "running"));
      index += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      jobs = await db
        .selectFrom("scan_job")
        .selectAll()
        .where("library_id", "=", rescanLibrary.id)
        .orderBy("created_at", "asc")
        .execute();
    }

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.status)).toEqual(["completed", "completed"]);
    expect(walkStarts).toBe(2);
  });

  test("cancels a queued scan before it starts", async () => {
    const mediaDir = path.join(tempDir, "queued-cancel");
    await mkdir(mediaDir, { recursive: true });
    const queuedLibrary = await createLibrary({
      name: "Queued Cancel",
      kind: "movie",
      path: mediaDir,
    });
    const jobId = await createScanJob(queuedLibrary.id);

    expect(await cancelScanJob(jobId)).toBe("cancelled");
    await runScanJob(jobId);

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "cancelled",
      files_seen: 0,
      files_added: 0,
      files_updated: 0,
    });
  });

  test("cancels a running scan cooperatively between files", async () => {
    const mediaDir = path.join(tempDir, "running-cancel");
    await mkdir(mediaDir, { recursive: true });
    const firstMovie = path.join(mediaDir, "Cancel.One.2026.mp4");
    const secondMovie = path.join(mediaDir, "Cancel.Two.2026.mp4");
    await writeFile(firstMovie, "one");
    await writeFile(secondMovie, "two");
    const runningLibrary = await createLibrary({
      name: "Running Cancel",
      kind: "movie",
      path: mediaDir,
    });
    const jobId = await createScanJob(runningLibrary.id);
    let resumeWalk: () => void = () => {};
    const walkPaused = new Promise<void>((resolve) => {
      resumeWalk = resolve;
    });

    const scanPromise = runScanJob(jobId, {
      metadataMatcher: async () => null,
      async *fileWalker() {
        yield { kind: "file", path: firstMovie };
        await walkPaused;
        yield { kind: "file", path: secondMovie };
      },
    });

    let job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    for (let index = 0; index < 20 && job.files_seen < 1; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    }

    expect(job).toMatchObject({ status: "running", files_seen: 1 });
    expect(await cancelScanJob(jobId)).toBe("requested");
    resumeWalk();
    await scanPromise;

    job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "cancelled",
      files_seen: 1,
      files_added: 1,
      files_updated: 0,
    });
    expect(
      await db.selectFrom("media_file").selectAll().where("library_id", "=", runningLibrary.id).execute(),
    ).toHaveLength(1);
  });

  test("starts scans for all configured movie libraries and skips unsupported kinds", async () => {
    const mediaDir = path.join(tempDir, "scan-all-movies");
    const showsDir = path.join(tempDir, "scan-all-shows");
    await mkdir(mediaDir, { recursive: true });
    await mkdir(showsDir, { recursive: true });

    const movieLibrary = await createLibrary({
      name: "Scan All Movies",
      kind: "movie",
      path: mediaDir,
    });
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "scan-all-tv-library",
        name: "Scan All Shows",
        kind: "tv",
        path: showsDir,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const movieLibraries = await db.selectFrom("library").select(["id"]).where("kind", "=", "movie").execute();
    const activeJobIds: string[] = [];
    for (const movie of movieLibraries) {
      const activeJob = await db
        .selectFrom("scan_job")
        .select("id")
        .where("library_id", "=", movie.id)
        .where("status", "in", ["queued", "running"])
        .executeTakeFirst();
      activeJobIds.push(activeJob?.id ?? (await createScanJob(movie.id)));
    }

    const result = await startAllMovieScans();
    expect(result).toEqual({
      libraries: movieLibraries.length,
      jobIds: activeJobIds,
    });

    const tvJobs = await db
      .selectFrom("scan_job")
      .select("id")
      .where("library_id", "=", "scan-all-tv-library")
      .execute();
    expect(tvJobs).toHaveLength(0);

    for (const jobId of activeJobIds) {
      await db
        .updateTable("scan_job")
        .set({ status: "cancelled", finished_at: new Date().toISOString() })
        .where("id", "=", jobId)
        .execute();
    }
    await db.deleteFrom("library").where("id", "=", "scan-all-tv-library").execute();
    await db.deleteFrom("library").where("id", "=", movieLibrary.id).execute();
  });

  test("resumes interrupted active scan jobs after restart", async () => {
    const mediaDir = path.join(tempDir, "resume-library");
    await mkdir(mediaDir, { recursive: true });
    const firstPath = path.join(mediaDir, "Already.Done.2024.mp4");
    const secondPath = path.join(mediaDir, "Recovery.Movie.2024.mp4");
    const thirdPath = path.join(mediaDir, "Final.Movie.2024.mp4");
    await writeFile(firstPath, "first movie");
    await writeFile(secondPath, "second movie");
    await writeFile(thirdPath, "third movie");
    const resumeLibrary = await createLibrary({
      name: "Resume Library",
      kind: "movie",
      path: mediaDir,
    });
    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values({
        id: "resume-movie-1",
        kind: "movie",
        title: "Already Done",
        sort_title: "already done",
        year: 2024,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2024-01-01",
        provider: null,
        provider_id: null,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "resume-file-1",
        library_id: resumeLibrary.id,
        media_item_id: "resume-movie-1",
        path: firstPath,
        basename: "Already.Done.2024.mp4",
        extension: ".mp4",
        size_bytes: 11,
        mtime_ms: Date.now(),
        duration_seconds: null,
        video_codec: null,
        audio_codec: null,
        container: "mp4",
        created_at: now,
        updated_at: now,
      })
      .execute();
    const interruptedJobId = await createScanJob(resumeLibrary.id);
    await db
      .updateTable("scan_job")
      .set({
        status: "running",
        started_at: now,
        files_seen: 1,
        files_added: 1,
        errors_count: 0,
        checkpoint_value: firstPath,
        runner_token: "stale-runner",
        runner_heartbeat_at: now,
      })
      .where("id", "=", interruptedJobId)
      .execute();
    const matchedTitles: string[] = [];

    const recovered = await resumeInterruptedJobs({
      scanOptions: {
        fileWalker: async function* () {
          yield { kind: "file", path: firstPath };
          yield { kind: "file", path: secondPath };
          yield { kind: "file", path: thirdPath };
        },
        metadataMatcher: async (title) => {
          matchedTitles.push(title);
          return null;
        },
      },
    });
    expect(recovered).toEqual({ resumed: 1, failed: 0 });

    const recoveredJob = await waitForScanJob(interruptedJobId);
    expect(recoveredJob).toMatchObject({
      status: "completed",
      files_seen: 3,
      files_added: 3,
      files_updated: 0,
      errors_count: 0,
    });
    expect(recoveredJob.finished_at).not.toBeNull();
    expect(recoveredJob.checkpoint_value).toBeNull();
    expect(recoveredJob.runner_token).toBeNull();
    expect(recoveredJob.runner_heartbeat_at).toBeNull();
    expect(matchedTitles).toEqual(["Recovery Movie", "Final Movie"]);

    const errors = await db
      .selectFrom("scan_job_error")
      .selectAll()
      .where("scan_job_id", "=", interruptedJobId)
      .execute();
    expect(errors).toHaveLength(0);

    const files = await db
      .selectFrom("media_file")
      .selectAll()
      .where("library_id", "=", resumeLibrary.id)
      .orderBy("basename")
      .execute();
    expect(files.map((file) => file.basename)).toEqual([
      "Already.Done.2024.mp4",
      "Final.Movie.2024.mp4",
      "Recovery.Movie.2024.mp4",
    ]);

    const newJobId = await createScanJob(resumeLibrary.id);
    expect(newJobId).not.toBe(interruptedJobId);
    await db.updateTable("scan_job").set({ status: "cancelled" }).where("id", "=", newJobId).execute();
    await db.deleteFrom("library").where("id", "=", resumeLibrary.id).execute();
  });

  test("stores probed media stream metadata when a probe backend is provided", async () => {
    const probedDir = path.join(tempDir, "probed-movies");
    await mkdir(probedDir);
    const probedPath = path.join(probedDir, "Probe.Movie.2026.mp4");
    await writeFile(probedPath, "probe fixture");
    const probedLibrary = await createLibrary({
      name: "Probed Movies",
      kind: "movie",
      path: probedDir,
    });
    let probedInputPath: string | null = null;
    const probeBackend: ProbeBackend = {
      async probe(input) {
        probedInputPath = input.path;
        return {
          container: "mov,mp4,m4a,3gp,3g2,mj2",
          durationSeconds: 123.4,
          bitRate: 2_000,
          streams: [
            {
              index: 0,
              type: "video",
              codecName: "h264",
              codecLongName: "H.264 / AVC",
              language: null,
              title: null,
              width: 1920,
              height: 1080,
              channels: null,
              sampleRate: null,
              durationSeconds: 123.4,
              bitRate: 1_800_000,
              frameRate: 23.976,
              rFrameRate: 24,
              nbFrames: 2959,
              raw: { codecId: 27 },
            },
            {
              index: 1,
              type: "audio",
              codecName: "aac",
              codecLongName: "AAC",
              language: "en",
              title: "English",
              width: null,
              height: null,
              channels: 2,
              sampleRate: 48000,
              durationSeconds: 123.4,
              bitRate: 192_000,
              frameRate: null,
              rFrameRate: null,
              nbFrames: null,
              raw: { codecId: 86018 },
            },
          ],
        };
      },
    };

    const jobId = await createScanJob(probedLibrary.id);
    await runScanJob(jobId, {
      metadataMatcher: async () => null,
      probeBackend,
    });
    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_added: 1,
      errors_count: 0,
    });
    expect(path.basename(probedInputPath ?? "")).toBe("Probe.Movie.2026.mp4");

    const file = await db
      .selectFrom("media_file")
      .selectAll()
      .where("library_id", "=", probedLibrary.id)
      .executeTakeFirstOrThrow();
    expect(file).toMatchObject({
      duration_seconds: 123.4,
      video_codec: "h264",
      audio_codec: "aac",
      container: "mp4",
    });

    const streams = await db
      .selectFrom("media_stream_info")
      .select([
        "stream_index",
        "stream_type",
        "codec_name",
        "language",
        "width",
        "height",
        "channels",
        "sample_rate",
        "bit_rate",
        "raw_json",
      ])
      .where("media_file_id", "=", file.id)
      .orderBy("stream_index")
      .execute();
    expect(streams).toMatchObject([
      {
        stream_index: 0,
        stream_type: "video",
        codec_name: "h264",
        width: 1920,
        height: 1080,
        bit_rate: 1_800_000,
      },
      {
        stream_index: 1,
        stream_type: "audio",
        codec_name: "aac",
        language: "en",
        channels: 2,
        sample_rate: 48000,
        bit_rate: 192_000,
      },
    ]);
    expect(JSON.parse(streams[0].raw_json ?? "{}")).toEqual({ codecId: 27 });

    await db.deleteFrom("library").where("id", "=", probedLibrary.id).execute();
  });

  async function settleAllActiveJobs() {
    await db
      .updateTable("scan_job")
      .set({ status: "cancelled", finished_at: new Date().toISOString() })
      .where("status", "in", ["queued", "running"])
      .execute();
  }

  test("resumes movie metadata refresh jobs after restart", async () => {
    await settleAllActiveJobs();
    const jobId = await createScanJob(library.id);
    await db
      .updateTable("scan_job")
      .set({
        job_kind: "movie_metadata_refresh",
        library_id: null,
        status: "running",
        started_at: new Date().toISOString(),
        runner_token: "stale-runner",
        runner_heartbeat_at: new Date().toISOString(),
      })
      .where("id", "=", jobId)
      .execute();

    const recovered = await resumeInterruptedJobs({
      movieMetadataOptions: { metadataMatcher: async () => null },
    });
    expect(recovered).toEqual({ resumed: 1, failed: 0 });

    const recoveredJob = await waitForScanJob(jobId);
    expect(recoveredJob.status).toBe("completed");
  });

  test("resumes tv metadata refresh jobs after restart", async () => {
    await settleAllActiveJobs();
    const jobId = await createScanJob(library.id);
    await db
      .updateTable("scan_job")
      .set({
        job_kind: "tv_metadata_refresh",
        library_id: null,
        status: "running",
        started_at: new Date().toISOString(),
        runner_token: "stale-runner",
        runner_heartbeat_at: new Date().toISOString(),
      })
      .where("id", "=", jobId)
      .execute();

    const recovered = await resumeInterruptedJobs({
      tvMetadataOptions: { metadataMatcher: async () => null },
    });
    expect(recovered).toEqual({ resumed: 1, failed: 0 });

    const recoveredJob = await waitForScanJob(jobId);
    expect(recoveredJob.status).toBe("completed");
  });

  test("resumes media probe refresh jobs after restart", async () => {
    await settleAllActiveJobs();
    const jobId = await createScanJob(library.id);
    await db
      .updateTable("scan_job")
      .set({
        job_kind: "media_probe_refresh",
        library_id: null,
        status: "running",
        started_at: new Date().toISOString(),
        runner_token: "stale-runner",
        runner_heartbeat_at: new Date().toISOString(),
      })
      .where("id", "=", jobId)
      .execute();

    const recovered = await resumeInterruptedJobs({
      mediaProbeOptions: {
        probeBackend: {
          async probe() {
            return {
              container: null,
              durationSeconds: null,
              bitRate: null,
              streams: [],
            };
          },
        },
      },
    });
    expect(recovered).toEqual({ resumed: 1, failed: 0 });

    const recoveredJob = await waitForScanJob(jobId);
    expect(recoveredJob.status).toBe("completed");
  });

  test("fails unknown job kinds during restart", async () => {
    await settleAllActiveJobs();
    const now = new Date().toISOString();
    const jobId = await createScanJob(library.id);
    await db
      .updateTable("scan_job")
      .set({
        job_kind: "unknown_job_kind" as unknown as "library_scan",
        library_id: null,
        status: "running",
        started_at: now,
        runner_token: "stale-runner",
        runner_heartbeat_at: now,
      })
      .where("id", "=", jobId)
      .execute();

    const recovered = await resumeInterruptedJobs();
    expect(recovered).toEqual({ resumed: 0, failed: 1 });

    const failedJob = await waitForScanJob(jobId, "failed");
    expect(failedJob).toMatchObject({
      status: "failed",
      errors_count: 1,
    });
    const errors = await db.selectFrom("scan_job_error").selectAll().where("scan_job_id", "=", jobId).execute();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      path: "job",
      message: "Unknown job kind: unknown_job_kind",
    });
  });

  test("fails library scan jobs without a library during restart", async () => {
    await settleAllActiveJobs();
    const now = new Date().toISOString();
    const jobId = await createScanJob(library.id);
    await db
      .updateTable("scan_job")
      .set({
        library_id: null,
        status: "running",
        started_at: now,
        runner_token: "stale-runner",
        runner_heartbeat_at: now,
      })
      .where("id", "=", jobId)
      .execute();

    const recovered = await resumeInterruptedJobs();
    expect(recovered).toEqual({ resumed: 0, failed: 1 });

    const failedJob = await waitForScanJob(jobId, "failed");
    expect(failedJob).toMatchObject({
      status: "failed",
      errors_count: 1,
    });
    const errors = await db.selectFrom("scan_job_error").selectAll().where("scan_job_id", "=", jobId).execute();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("Library scan job has no library.");
  });

  test("marks a scan job failed when the file walker throws", async () => {
    const mediaDir = path.join(tempDir, "walker-throw");
    await mkdir(mediaDir);
    const thrownLibrary = await createLibrary({
      name: "Walker Throw",
      kind: "movie",
      path: mediaDir,
    });
    const jobId = await createScanJob(thrownLibrary.id);

    await runScanJob(jobId, {
      async *fileWalker() {
        throw new Error("disk exploded");
      },
    });

    const failedJob = await waitForScanJob(jobId, "failed");
    expect(failedJob).toMatchObject({
      status: "failed",
      errors_count: 1,
    });
    const errors = await db.selectFrom("scan_job_error").selectAll().where("scan_job_id", "=", jobId).execute();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("disk exploded");

    await db.deleteFrom("library").where("id", "=", thrownLibrary.id).execute();
  });

  test("marks a scan job cancelled when the walker throws after a cancellation request", async () => {
    const mediaDir = path.join(tempDir, "walker-throw-cancel");
    await mkdir(mediaDir);
    const cancelledLibrary = await createLibrary({
      name: "Walker Throw Cancel",
      kind: "movie",
      path: mediaDir,
    });
    const jobId = await createScanJob(cancelledLibrary.id);

    await runScanJob(jobId, {
      async *fileWalker() {
        await cancelScanJob(jobId);
        throw new Error("disk exploded");
      },
    });

    await waitForScanJob(jobId, "cancelled");
    const errors = await db.selectFrom("scan_job_error").selectAll().where("scan_job_id", "=", jobId).execute();
    expect(errors).toHaveLength(0);

    await db.deleteFrom("library").where("id", "=", cancelledLibrary.id).execute();
  });

  test("fails a resumed scan when the checkpoint is no longer in the walk", async () => {
    const mediaDir = path.join(tempDir, "checkpoint-missing");
    await mkdir(mediaDir);
    const checkpointLibrary = await createLibrary({
      name: "Checkpoint Missing",
      kind: "movie",
      path: mediaDir,
    });
    const now = new Date().toISOString();
    const jobId = await createScanJob(checkpointLibrary.id);
    await db
      .updateTable("scan_job")
      .set({
        status: "running",
        started_at: now,
        files_seen: 1,
        files_added: 1,
        checkpoint_value: path.join(mediaDir, "Gone.Movie.2026.mp4"),
        runner_token: null,
        runner_heartbeat_at: null,
      })
      .where("id", "=", jobId)
      .execute();

    await runScanJob(jobId, {
      async *fileWalker() {
        yield { kind: "file", path: path.join(mediaDir, "Other.Movie.2026.mp4") };
      },
    });

    const failedJob = await waitForScanJob(jobId, "failed");
    expect(failedJob).toMatchObject({
      status: "failed",
      errors_count: 1,
    });
    const errors = await db.selectFrom("scan_job_error").selectAll().where("scan_job_id", "=", jobId).execute();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Scan checkpoint was not found");

    await db.deleteFrom("library").where("id", "=", checkpointLibrary.id).execute();
  });

  test("cancelScanJob reports missing and inactive jobs", async () => {
    expect(await cancelScanJob("no-such-job")).toBe("missing");

    const mediaDir = path.join(tempDir, "inactive-cancel");
    await mkdir(mediaDir);
    const inactiveLibrary = await createLibrary({
      name: "Inactive Cancel",
      kind: "movie",
      path: mediaDir,
    });
    const jobId = await createScanJob(inactiveLibrary.id);
    await db
      .updateTable("scan_job")
      .set({ status: "completed", finished_at: new Date().toISOString() })
      .where("id", "=", jobId)
      .execute();

    expect(await cancelScanJob(jobId)).toBe("inactive");
    await db.deleteFrom("library").where("id", "=", inactiveLibrary.id).execute();
  });

  test("startScan throws for an unknown library", async () => {
    await expect(startScan("missing-library")).rejects.toThrow("Library not found.");
  });

  test("startScan returns an existing active job when creating a new one races", async () => {
    const mediaDir = path.join(tempDir, "start-race");
    await mkdir(mediaDir);
    const raceLibrary = await createLibrary({
      name: "Start Race",
      kind: "movie",
      path: mediaDir,
    });
    const activeJobId = await createScanJob(raceLibrary.id);
    await db
      .updateTable("scan_job")
      .set({ status: "running", runner_token: "existing-runner", runner_heartbeat_at: new Date().toISOString() })
      .where("id", "=", activeJobId)
      .execute();

    const options = {
      metadataMatcher: async () => null,
    };
    const secondJobId = await startScan(raceLibrary.id, options);
    expect(secondJobId).toBe(activeJobId);

    await db.updateTable("scan_job").set({ status: "cancelled" }).where("id", "=", activeJobId).execute();
    await db.deleteFrom("library").where("id", "=", raceLibrary.id).execute();
  });
});
