import { getDb } from "../db";
import { createId } from "../id";
import { nowIso } from "../time";
import { getLibrary, listLibraries } from "../libraries";
import type { LibraryKind } from "../db/schema";
import { runMovieMetadataRefreshJob } from "../metadata/movies";
import { runTvMetadataRefreshJob } from "../metadata/tv";
import { createLibraryStorage, type LibraryStorage } from "../storage";
import { nodeAvBackend } from "../transcoding/node-av";
import { runMediaProbeRefreshJob } from "../transcoding/probe-jobs";
import { isVideoFilePath } from "./media-files";
import {
  cacheWalkDirectoryEntry,
  defaultDirectoryFileReader,
  loadExistingLibraryFiles,
  pruneMissingLibraryFiles,
  releaseWalkDirectoryFile,
} from "./scan-context";
import { scanMovieFile } from "./scan-movies";
import { scanTvFile } from "./scan-tv";
import type { LibraryScanHandler, ResumeInterruptedJobsOptions, ScanContext, ScanOptions } from "./scan-types";

const runningScanJobs = new Set<string>();

const LIBRARY_SCAN_HANDLERS: Partial<Record<LibraryKind, LibraryScanHandler>> = {
  movie: {
    mediaKind: "movie",
    scanFile: scanMovieFile,
  },
  tv: {
    mediaKind: "episode",
    scanFile: scanTvFile,
  },
};

function isTerminalScanStatus(status: "queued" | "running" | "completed" | "failed" | "cancelled") {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function getLibraryScanHandler(kind: LibraryKind) {
  const handler = LIBRARY_SCAN_HANDLERS[kind];
  if (!handler) throw new Error(`Scanning ${kind} libraries is not implemented.`);
  return handler;
}

async function updateJob(
  id: string,
  values: Partial<{
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    started_at: string | null;
    finished_at: string | null;
    files_seen: number;
    files_added: number;
    files_updated: number;
    files_removed: number;
    errors_count: number;
    checkpoint_value: string | null;
    runner_token: string | null;
    runner_heartbeat_at: string | null;
  }>,
  runnerToken?: string,
) {
  const db = await getDb();
  const now = nowIso();
  const terminalStatus = values.status ? isTerminalScanStatus(values.status) : false;
  let query = db
    .updateTable("scan_job")
    .set({
      ...values,
      ...(terminalStatus
        ? {
            checkpoint_value: null,
            runner_token: null,
            runner_heartbeat_at: null,
          }
        : runnerToken
          ? { runner_heartbeat_at: now }
          : {}),
      updated_at: now,
    })
    .where("id", "=", id);

  if (runnerToken) query = query.where("runner_token", "=", runnerToken);
  await query.execute();
}

async function addJobError(jobId: string, filePath: string, error: unknown) {
  const db = await getDb();
  const message = error instanceof Error ? error.message : String(error);
  await db
    .insertInto("scan_job_error")
    .values({
      scan_job_id: jobId,
      path: filePath,
      message,
      created_at: nowIso(),
    })
    .execute();
}

export async function createScanJob(libraryId: string) {
  const db = await getDb();
  const now = nowIso();
  const id = createId();
  await db
    .insertInto("scan_job")
    .values({
      id,
      job_kind: "library_scan",
      library_id: libraryId,
      status: "queued",
      started_at: null,
      finished_at: null,
      files_seen: 0,
      files_added: 0,
      files_updated: 0,
      files_removed: 0,
      errors_count: 0,
      cancel_requested_at: null,
      rescan_requested_at: null,
      checkpoint_value: null,
      runner_token: null,
      runner_heartbeat_at: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  return id;
}

async function getActiveScanJobId(libraryId: string) {
  const db = await getDb();
  const activeJob = await db
    .selectFrom("scan_job")
    .select("id")
    .where("library_id", "=", libraryId)
    .where("status", "in", ["queued", "running"])
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  return activeJob?.id ?? null;
}

async function isScanCancellationRequested(jobId: string) {
  const db = await getDb();
  const job = await db.selectFrom("scan_job").select("cancel_requested_at").where("id", "=", jobId).executeTakeFirst();
  return Boolean(job?.cancel_requested_at);
}

async function markScanJobRunning(jobId: string, runnerToken: string) {
  const db = await getDb();
  const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirst();
  if (!job?.library_id) throw new Error("Scan job has no library.");
  if (job.status !== "queued" && job.status !== "running") return null;

  const now = nowIso();
  const isResume = job.status === "running" && job.checkpoint_value !== null;
  const result = await db
    .updateTable("scan_job")
    .set({
      status: "running",
      started_at: job.started_at ?? now,
      finished_at: null,
      ...(isResume
        ? {}
        : {
            files_seen: 0,
            files_added: 0,
            files_updated: 0,
            files_removed: 0,
            errors_count: 0,
            checkpoint_value: null,
          }),
      runner_token: runnerToken,
      runner_heartbeat_at: now,
      updated_at: now,
    })
    .where("id", "=", jobId)
    .where("status", "in", ["queued", "running"])
    .where("runner_token", "is", null)
    .executeTakeFirst();

  if (result.numUpdatedRows === 0n) return null;
  if (!isResume) await db.deleteFrom("scan_job_error").where("scan_job_id", "=", jobId).execute();
  return {
    ...job,
    library_id: job.library_id,
    files_seen: isResume ? job.files_seen : 0,
    files_added: isResume ? job.files_added : 0,
    files_updated: isResume ? job.files_updated : 0,
    files_removed: isResume ? job.files_removed : 0,
    errors_count: isResume ? job.errors_count : 0,
    checkpoint_value: isResume ? job.checkpoint_value : null,
  };
}

async function requestRescanForActiveJob(jobId: string) {
  const db = await getDb();
  const now = nowIso();
  const result = await db
    .updateTable("scan_job")
    .set({ rescan_requested_at: now, updated_at: now })
    .where("id", "=", jobId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();
  return result.numUpdatedRows > 0n;
}

async function activeJobHasRescanRequest(jobId: string) {
  const db = await getDb();
  const job = await db.selectFrom("scan_job").select("rescan_requested_at").where("id", "=", jobId).executeTakeFirst();
  return Boolean(job?.rescan_requested_at);
}

async function startFollowUpScanIfRequested(jobId: string, libraryId: string, options: ScanOptions) {
  if (!(await activeJobHasRescanRequest(jobId))) return;
  try {
    const nextJobId = await createScanJob(libraryId);
    void runScanJob(nextJobId, options);
  } catch (error) {
    const activeJobId = await getActiveScanJobId(libraryId);
    if (activeJobId) {
      await requestRescanForActiveJob(activeJobId);
      return;
    }

    console.error(`Could not start follow-up scan for library ${libraryId}:`, error);
  }
}

export async function cancelScanJob(jobId: string) {
  const db = await getDb();
  const job = await db.selectFrom("scan_job").select(["id", "status"]).where("id", "=", jobId).executeTakeFirst();

  if (!job) return "missing" as const;
  if (job.status !== "queued" && job.status !== "running") return "inactive" as const;

  if (job.status === "queued") {
    const now = nowIso();
    const result = await db
      .updateTable("scan_job")
      .set({ status: "cancelled", finished_at: now, updated_at: now })
      .where("id", "=", jobId)
      .where("status", "=", "queued")
      .executeTakeFirst();

    if (result.numUpdatedRows > 0n) {
      return "cancelled" as const;
    }
  }

  await db
    .updateTable("scan_job")
    .set({ cancel_requested_at: nowIso(), updated_at: nowIso() })
    .where("id", "=", jobId)
    .where("status", "=", "running")
    .execute();

  return "requested" as const;
}

async function failInterruptedJob(jobId: string, error: Error) {
  const db = await getDb();
  await addJobError(jobId, "job", error);
  await db
    .updateTable("scan_job")
    .set({
      status: "failed",
      finished_at: nowIso(),
      errors_count: 1,
      checkpoint_value: null,
      runner_token: null,
      runner_heartbeat_at: null,
      updated_at: nowIso(),
    })
    .where("id", "=", jobId)
    .where("status", "in", ["queued", "running"])
    .execute();
}

async function clearActiveJobLeases() {
  const db = await getDb();
  await db
    .updateTable("scan_job")
    .set({
      runner_token: null,
      runner_heartbeat_at: null,
      updated_at: nowIso(),
    })
    .where("status", "in", ["queued", "running"])
    .execute();
}

export async function resumeInterruptedJobs(options: ResumeInterruptedJobsOptions = {}) {
  const db = await getDb();
  await clearActiveJobLeases();
  const activeJobs = await db
    .selectFrom("scan_job")
    .select(["id", "job_kind", "library_id"])
    .where("status", "in", ["queued", "running"])
    .orderBy("created_at", "asc")
    .execute();

  let resumed = 0;
  let failed = 0;

  for (const job of activeJobs) {
    if (job.job_kind === "library_scan") {
      if (!job.library_id) {
        failed += 1;
        await failInterruptedJob(job.id, new Error("Library scan job has no library."));
        continue;
      }

      resumed += 1;
      void runScanJob(job.id, options.scanOptions);
      continue;
    }

    if (job.job_kind === "movie_metadata_refresh") {
      resumed += 1;
      void runMovieMetadataRefreshJob(job.id, options.movieMetadataOptions);
      continue;
    }

    if (job.job_kind === "tv_metadata_refresh") {
      resumed += 1;
      void runTvMetadataRefreshJob(job.id, options.tvMetadataOptions);
      continue;
    }

    if (job.job_kind === "media_probe_refresh") {
      resumed += 1;
      void runMediaProbeRefreshJob(job.id, options.mediaProbeOptions);
      continue;
    }

    failed += 1;
    await failInterruptedJob(job.id, new Error(`Unknown job kind: ${job.job_kind}`));
  }

  return { resumed, failed };
}

export async function runScanJob(jobId: string, options: ScanOptions = {}) {
  if (runningScanJobs.has(jobId)) return;
  runningScanJobs.add(jobId);

  let filesSeen = 0;
  let filesAdded = 0;
  let filesUpdated = 0;
  let filesRemoved = 0;
  let errorsCount = 0;
  let errorPath = "scan";
  let traversalHadErrors = false;
  let fileProcessingHadErrors = false;
  let cancelled = false;
  let runningLibraryId: string | null = null;
  const seenPaths = new Set<string>();
  let resumeCheckpoint: string | null = null;
  let waitingForCheckpoint = false;
  let storage: LibraryStorage | undefined;
  const runnerToken = createId();

  try {
    const job = await markScanJobRunning(jobId, runnerToken);
    if (!job) return;

    filesSeen = job.files_seen;
    filesAdded = job.files_added;
    filesUpdated = job.files_updated;
    filesRemoved = job.files_removed;
    errorsCount = job.errors_count;
    resumeCheckpoint = job.checkpoint_value;
    waitingForCheckpoint = resumeCheckpoint !== null;
    if (resumeCheckpoint && errorsCount > 0) traversalHadErrors = true;
    errorPath = job.library_id;
    runningLibraryId = job.library_id;
    const library = await getLibrary(job.library_id);
    if (!library) throw new Error("Library not found.");
    errorPath = library.path;
    const scanHandler = getLibraryScanHandler(library.kind);
    storage = options.storage ?? (await createLibraryStorage(library));
    const context: ScanContext = {
      directoryEntryCache: new Map(),
      directoryVideoCounts: new Map(),
      directoryFileReader: options.directoryFileReader ?? defaultDirectoryFileReader(storage),
      existingFilesByPath: await loadExistingLibraryFiles(library.id),
      tvSeasonMetadataCache: new Map(),
      tvSeasonEpisodeSyncCache: new Map(),
      probeBackend: options.probeBackend === undefined ? nodeAvBackend : options.probeBackend,
      storage,
    };
    const fileWalker = options.fileWalker ?? storage.walkFiles;
    for await (const entry of fileWalker(storage.root ?? library.path)) {
      if (await isScanCancellationRequested(jobId)) {
        cancelled = true;
        break;
      }

      if (entry.kind === "error") {
        traversalHadErrors = true;
        errorsCount += 1;
        await addJobError(jobId, entry.path, entry.error);
        await updateJob(
          jobId,
          {
            files_seen: filesSeen,
            files_added: filesAdded,
            files_updated: filesUpdated,
            errors_count: errorsCount,
          },
          runnerToken,
        );
        continue;
      }

      if (entry.kind === "directory") {
        cacheWalkDirectoryEntry(entry, context);
        continue;
      }

      const filePath = entry.path;
      if (!isVideoFilePath(filePath)) continue;
      if (waitingForCheckpoint) {
        seenPaths.add(filePath);
        if (filePath === resumeCheckpoint) waitingForCheckpoint = false;
        releaseWalkDirectoryFile(filePath, context);
        continue;
      }

      filesSeen += 1;
      let processedSuccessfully = false;
      try {
        const result = await scanHandler.scanFile(
          library,
          filePath,
          entry.file,
          context,
          async (error) => {
            await addJobError(jobId, filePath, error);
            errorsCount += 1;
          },
          options.metadataMatcher,
          options.tvSeasonMetadataMatcher,
        );
        seenPaths.add(filePath);
        if (result === "added") filesAdded += 1;
        if (result === "updated") filesUpdated += 1;
        processedSuccessfully = true;
      } catch (error) {
        fileProcessingHadErrors = true;
        errorsCount += 1;
        await addJobError(jobId, filePath, error);
      }

      await updateJob(
        jobId,
        {
          files_seen: filesSeen,
          files_added: filesAdded,
          files_updated: filesUpdated,
          errors_count: errorsCount,
          ...(processedSuccessfully ? { checkpoint_value: filePath } : {}),
        },
        runnerToken,
      );
      releaseWalkDirectoryFile(filePath, context);
    }

    if (waitingForCheckpoint) {
      throw new Error(`Scan checkpoint was not found: ${resumeCheckpoint}`);
    }

    if (cancelled || (await isScanCancellationRequested(jobId))) {
      await updateJob(
        jobId,
        {
          status: "cancelled",
          finished_at: nowIso(),
          files_seen: filesSeen,
          files_added: filesAdded,
          files_updated: filesUpdated,
          errors_count: errorsCount,
        },
        runnerToken,
      );
      return;
    }

    if (!traversalHadErrors && !fileProcessingHadErrors) {
      filesRemoved = await pruneMissingLibraryFiles(library, seenPaths, scanHandler.mediaKind);
    }

    await updateJob(
      jobId,
      {
        status: "completed",
        finished_at: nowIso(),
        files_seen: filesSeen,
        files_added: filesAdded,
        files_updated: filesUpdated,
        files_removed: filesRemoved,
        errors_count: errorsCount,
      },
      runnerToken,
    );
    await startFollowUpScanIfRequested(jobId, library.id, options);
  } catch (error) {
    if (await isScanCancellationRequested(jobId)) {
      await updateJob(
        jobId,
        {
          status: "cancelled",
          finished_at: nowIso(),
          files_seen: filesSeen,
          files_added: filesAdded,
          files_updated: filesUpdated,
          errors_count: errorsCount,
        },
        runnerToken,
      );
      return;
    }

    errorsCount += 1;
    await addJobError(jobId, errorPath, error);
    await updateJob(
      jobId,
      {
        status: "failed",
        finished_at: nowIso(),
        errors_count: errorsCount,
      },
      runnerToken,
    );
    if (runningLibraryId) await startFollowUpScanIfRequested(jobId, runningLibraryId, options);
  } finally {
    try {
      await storage?.close();
    } catch (error) {
      console.error(`Could not close scan storage for job ${jobId}:`, error);
    }
    runningScanJobs.delete(jobId);
  }
}

export async function startScan(libraryId: string, options: ScanOptions = {}) {
  const library = await getLibrary(libraryId);
  if (!library) throw new Error("Library not found.");

  const activeJobId = await getActiveScanJobId(libraryId);
  if (activeJobId && (await requestRescanForActiveJob(activeJobId))) return activeJobId;

  let jobId: string;
  try {
    jobId = await createScanJob(libraryId);
  } catch (error) {
    const existingJobId = await getActiveScanJobId(libraryId);
    if (existingJobId) return existingJobId;
    throw error;
  }

  void runScanJob(jobId, options);
  return jobId;
}

export async function startAllMovieScans(options: ScanOptions = {}) {
  const libraries = (await listLibraries()).filter((library) => library.kind === "movie");
  const jobIds: string[] = [];

  for (const library of libraries) {
    jobIds.push(await startScan(library.id, options));
  }

  return {
    libraries: libraries.length,
    jobIds,
  };
}

export async function startAllLibraryScans(options: ScanOptions = {}) {
  const libraries = (await listLibraries()).filter((library) => Boolean(LIBRARY_SCAN_HANDLERS[library.kind]));
  const jobIds: string[] = [];

  for (const library of libraries) {
    jobIds.push(await startScan(library.id, options));
  }

  return {
    libraries: libraries.length,
    jobIds,
  };
}
