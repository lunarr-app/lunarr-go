import { sql } from "kysely";
import { getDb } from "../db";
import type { LibrarySource, ScanJobStatus } from "../db/schema";
import { createId } from "../id";
import { createLibraryStorage, type LibraryStorage } from "../storage";
import { nowIso } from "../time";
import type { ProbeBackend } from "./backend";
import { nodeAvBackend } from "./node-av";
import { mediaFileValuesFromProbe, replaceMediaStreamInfo } from "./probe";
import { createSeekableInputSourceFromStorage } from "./seekable-input";

export type MediaProbeRefreshOptions = {
  probeBackend?: ProbeBackend | null;
};

type ProbeRepairFile = {
  id: string;
  library_id: string;
  path: string;
  extension: string;
  size_bytes: number;
  container: string | null;
  source: LibrarySource;
  config_json: string | null;
};

const runningMediaProbeJobs = new Set<string>();

function isTerminalJobStatus(status: ScanJobStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

async function addProbeJobError(jobId: string, item: string, error: unknown) {
  const db = await getDb();
  await db
    .insertInto("scan_job_error")
    .values({
      scan_job_id: jobId,
      path: item,
      message: error instanceof Error ? error.message : String(error),
      created_at: nowIso()
    })
    .execute();
}

async function updateProbeJob(
  jobId: string,
  values: Partial<{
    status: ScanJobStatus;
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
  runnerToken?: string
) {
  const db = await getDb();
  const now = nowIso();
  const terminalStatus = values.status ? isTerminalJobStatus(values.status) : false;
  let query = db
    .updateTable("scan_job")
    .set({
      ...values,
      ...(terminalStatus
        ? { checkpoint_value: null, runner_token: null, runner_heartbeat_at: null }
        : runnerToken
          ? { runner_heartbeat_at: now }
          : {}),
      updated_at: now
    })
    .where("id", "=", jobId);
  if (runnerToken) query = query.where("runner_token", "=", runnerToken);
  await query.execute();
}

async function getActiveMediaProbeRefreshJobId() {
  const db = await getDb();
  const job = await db
    .selectFrom("scan_job")
    .select("id")
    .where("job_kind", "=", "media_probe_refresh")
    .where("library_id", "is", null)
    .where("status", "in", ["queued", "running"])
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  return job?.id ?? null;
}

async function createMediaProbeRefreshJob() {
  const activeJobId = await getActiveMediaProbeRefreshJobId();
  if (activeJobId) return { id: activeJobId, existing: true };

  const db = await getDb();
  const now = nowIso();
  const id = createId();
  try {
    await db
      .insertInto("scan_job")
      .values({
        id,
        job_kind: "media_probe_refresh",
        library_id: null,
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
        updated_at: now
      })
      .execute();
  } catch (error) {
    const activeJobId = await getActiveMediaProbeRefreshJobId();
    if (activeJobId) return { id: activeJobId, existing: true };
    throw error;
  }

  return { id, existing: false };
}

async function isProbeJobCancellationRequested(jobId: string) {
  const db = await getDb();
  const job = await db.selectFrom("scan_job").select("cancel_requested_at").where("id", "=", jobId).executeTakeFirst();
  return Boolean(job?.cancel_requested_at);
}

async function loadProbeRepairFiles() {
  const db = await getDb();
  return db
    .selectFrom("media_file")
    .innerJoin("library", "library.id", "media_file.library_id")
    .select([
      "media_file.id",
      "media_file.library_id",
      "media_file.path",
      "media_file.extension",
      "media_file.size_bytes",
      "media_file.container",
      "library.source",
      "library.config_json"
    ])
    .where((eb) =>
      eb.or([
        eb("media_file.duration_seconds", "is", null),
        eb("media_file.video_codec", "is", null),
        eb("media_file.audio_codec", "is", null)
      ])
    )
    .orderBy("media_file.library_id", "asc")
    .orderBy("media_file.path", "asc")
    .orderBy("media_file.id", "asc")
    .execute();
}

async function probeFile(input: {
  file: ProbeRepairFile;
  storage: LibraryStorage;
  probeBackend: ProbeBackend;
}) {
  if (input.file.source !== "sftp") {
    return input.probeBackend.probe({
      mediaFileId: input.file.id,
      path: input.file.path
    });
  }

  const fallbackValues = mediaFileValuesFromProbe({ extension: input.file.extension }, null);
  const inputSource = createSeekableInputSourceFromStorage({
    file: {
      path: input.file.path,
      extension: input.file.extension,
      container: input.file.container ?? fallbackValues.container,
      sizeBytes: input.file.size_bytes
    },
    storage: input.storage
  });
  try {
    return await input.probeBackend.probe({
      mediaFileId: input.file.id,
      path: input.file.path,
      inputSource
    });
  } finally {
    await inputSource.close().catch(() => undefined);
  }
}

async function storageForFile(input: {
  file: ProbeRepairFile;
  currentStorage: LibraryStorage | null;
  currentLibraryId: string | null;
}) {
  if (input.currentStorage && input.currentLibraryId === input.file.library_id) {
    return {
      storage: input.currentStorage,
      libraryId: input.currentLibraryId
    };
  }

  await input.currentStorage?.close().catch(() => undefined);
  return {
    storage: await createLibraryStorage(input.file),
    libraryId: input.file.library_id
  };
}

export async function runMediaProbeRefreshJob(jobId: string, options: MediaProbeRefreshOptions = {}) {
  if (runningMediaProbeJobs.has(jobId)) return;
  runningMediaProbeJobs.add(jobId);

  const db = await getDb();
  const runnerToken = createId();
  const probeBackend = options.probeBackend === undefined ? nodeAvBackend : options.probeBackend;
  let seen = 0;
  let updated = 0;
  let errors = 0;
  let resumeCheckpoint: string | null = null;
  let waitingForCheckpoint = false;
  let storage: LibraryStorage | null = null;
  let storageLibraryId: string | null = null;

  try {
    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirst();
    if (!job || (job.status !== "queued" && job.status !== "running")) return;

    const startedAt = job.started_at ?? nowIso();
    const now = nowIso();
    const isResume = job.status === "running" && job.checkpoint_value !== null;
    const result = await db
      .updateTable("scan_job")
      .set({
        status: "running",
        started_at: startedAt,
        finished_at: null,
        ...(isResume
          ? {}
          : {
              files_seen: 0,
              files_added: 0,
              files_updated: 0,
              files_removed: 0,
              errors_count: 0,
              checkpoint_value: null
            }),
        runner_token: runnerToken,
        runner_heartbeat_at: now,
        updated_at: now
      })
      .where("id", "=", jobId)
      .where("status", "in", ["queued", "running"])
      .where("runner_token", "is", null)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) return;
    if (!isResume) await db.deleteFrom("scan_job_error").where("scan_job_id", "=", jobId).execute();

    seen = isResume ? job.files_seen : 0;
    updated = isResume ? job.files_updated : 0;
    errors = isResume ? job.errors_count : 0;
    resumeCheckpoint = isResume ? job.checkpoint_value : null;

    const files = await loadProbeRepairFiles();
    if (resumeCheckpoint && !files.some((file) => file.id === resumeCheckpoint)) {
      seen = 0;
      updated = 0;
      errors = 0;
      resumeCheckpoint = null;
      await db.deleteFrom("scan_job_error").where("scan_job_id", "=", jobId).execute();
      await updateProbeJob(jobId, {
        files_seen: 0,
        files_updated: 0,
        errors_count: 0,
        checkpoint_value: null
      }, runnerToken);
    }
    waitingForCheckpoint = resumeCheckpoint !== null;

    if (!probeBackend) {
      throw new Error("Media probing is not available.");
    }

    for (const file of files) {
      if (await isProbeJobCancellationRequested(jobId)) {
        await updateProbeJob(jobId, {
          status: "cancelled",
          finished_at: nowIso(),
          files_seen: seen,
          files_updated: updated,
          errors_count: errors
        }, runnerToken);
        return;
      }

      if (waitingForCheckpoint) {
        if (file.id === resumeCheckpoint) waitingForCheckpoint = false;
        continue;
      }

      seen += 1;
      try {
        const storageResult = await storageForFile({
          file,
          currentStorage: storage,
          currentLibraryId: storageLibraryId
        });
        storage = storageResult.storage;
        storageLibraryId = storageResult.libraryId;

        const probe = await probeFile({
          file,
          storage,
          probeBackend
        });
        const now = nowIso();
        await db
          .updateTable("media_file")
          .set({
            ...mediaFileValuesFromProbe({ extension: file.extension }, probe),
            updated_at: now
          })
          .where("id", "=", file.id)
          .execute();
        await replaceMediaStreamInfo(file.id, probe, now);
        updated += 1;
      } catch (error) {
        errors += 1;
        await addProbeJobError(jobId, file.path, error);
      }

      await updateProbeJob(jobId, {
        files_seen: seen,
        files_updated: updated,
        errors_count: errors,
        checkpoint_value: file.id
      }, runnerToken);
    }

    await updateProbeJob(jobId, {
      status: "completed",
      finished_at: nowIso(),
      files_seen: seen,
      files_updated: updated,
      errors_count: errors
    }, runnerToken);
  } catch (error) {
    await addProbeJobError(jobId, "media probe refresh", error);
    await db
      .updateTable("scan_job")
      .set({
        status: await isProbeJobCancellationRequested(jobId) ? "cancelled" : "failed",
        finished_at: nowIso(),
        errors_count: sql<number>`errors_count + 1`,
        checkpoint_value: null,
        runner_token: null,
        runner_heartbeat_at: null,
        updated_at: nowIso()
      })
      .where("id", "=", jobId)
      .where("runner_token", "=", runnerToken)
      .execute();
  } finally {
    await storage?.close().catch(() => undefined);
    runningMediaProbeJobs.delete(jobId);
  }
}

export async function startMediaProbeRefreshJob(options: MediaProbeRefreshOptions = {}) {
  const job = await createMediaProbeRefreshJob();
  if (!job.existing) void runMediaProbeRefreshJob(job.id, options);
  return job;
}
