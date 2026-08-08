import { sql } from "kysely";
import { getDb } from "../db";
import { createId } from "../id";
import { nowIso } from "../time";

export type MetadataRefreshJobKind = "movie_metadata_refresh" | "tv_metadata_refresh";

export function isTerminalJobStatus(status: "queued" | "running" | "completed" | "failed" | "cancelled") {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export async function addMetadataJobError(jobId: string, item: string, error: unknown) {
  const db = await getDb();
  await db
    .insertInto("scan_job_error")
    .values({
      scan_job_id: jobId,
      path: item,
      message: error instanceof Error ? error.message : String(error),
      created_at: nowIso(),
    })
    .execute();
}

export async function updateMetadataJob(
  jobId: string,
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
  const terminalStatus = values.status ? isTerminalJobStatus(values.status) : false;
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
    .where("id", "=", jobId);
  if (runnerToken) query = query.where("runner_token", "=", runnerToken);
  await query.execute();
}

async function isMetadataJobCancellationRequested(jobId: string) {
  const db = await getDb();
  const job = await db.selectFrom("scan_job").select("cancel_requested_at").where("id", "=", jobId).executeTakeFirst();
  return Boolean(job?.cancel_requested_at);
}

export async function getActiveMetadataRefreshJobId(
  kind: MetadataRefreshJobKind,
  libraryScope: "null" | "any" = "any",
) {
  const db = await getDb();
  let query = db
    .selectFrom("scan_job")
    .select("id")
    .where("job_kind", "=", kind)
    .where("status", "in", ["queued", "running"])
    .orderBy("created_at", "desc");
  if (libraryScope === "null") query = query.where("library_id", "is", null);
  const job = await query.executeTakeFirst();
  return job?.id ?? null;
}

export async function createMetadataRefreshJob(kind: MetadataRefreshJobKind, libraryScope: "null" | "any" = "any") {
  const activeJobId = await getActiveMetadataRefreshJobId(kind, libraryScope);
  if (activeJobId) return { id: activeJobId, existing: true };

  const db = await getDb();
  const now = nowIso();
  const id = createId();
  try {
    await db
      .insertInto("scan_job")
      .values({
        id,
        job_kind: kind,
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
        updated_at: now,
      })
      .execute();
  } catch (error) {
    const activeJobId = await getActiveMetadataRefreshJobId(kind, libraryScope);
    if (activeJobId) return { id: activeJobId, existing: true };
    throw error;
  }

  return { id, existing: false };
}

export type MetadataRefreshJobItem = {
  id: string;
  label: string;
};

export type MetadataRefreshJobRunnerOptions = {
  jobKind: MetadataRefreshJobKind;
  stalenessDays?: number;
  fetchItems: (stalenessDays: number | undefined) => Promise<MetadataRefreshJobItem[]>;
  processItem: (itemId: string) => Promise<{ updated: boolean; added?: number; removed?: number }>;
  errorLabel: string;
};

const runningMetadataRefreshJobs = new Set<string>();

export async function runMetadataRefreshJob(jobId: string, options: MetadataRefreshJobRunnerOptions) {
  if (runningMetadataRefreshJobs.has(jobId)) return;
  runningMetadataRefreshJobs.add(jobId);

  const db = await getDb();
  const runnerToken = createId();
  let seen = 0;
  let matched = 0;
  let added = 0;
  let removed = 0;
  let errors = 0;
  let resumeCheckpoint: string | null = null;
  let waitingForCheckpoint = false;

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
    if (result.numUpdatedRows === 0n) return;
    if (!isResume) await db.deleteFrom("scan_job_error").where("scan_job_id", "=", jobId).execute();

    seen = isResume ? job.files_seen : 0;
    matched = isResume ? job.files_updated : 0;
    added = isResume ? job.files_added : 0;
    removed = isResume ? job.files_removed : 0;
    errors = isResume ? job.errors_count : 0;
    resumeCheckpoint = isResume ? job.checkpoint_value : null;

    const items = await options.fetchItems(options.stalenessDays);

    if (resumeCheckpoint && !items.some((item) => item.id === resumeCheckpoint)) {
      seen = 0;
      matched = 0;
      added = 0;
      removed = 0;
      errors = 0;
      resumeCheckpoint = null;
      await db.deleteFrom("scan_job_error").where("scan_job_id", "=", jobId).execute();
      await updateMetadataJob(
        jobId,
        {
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          files_removed: 0,
          errors_count: 0,
          checkpoint_value: null,
        },
        runnerToken,
      );
    }
    waitingForCheckpoint = resumeCheckpoint !== null;

    for (const item of items) {
      if (await isMetadataJobCancellationRequested(jobId)) {
        await updateMetadataJob(
          jobId,
          {
            status: "cancelled",
            finished_at: nowIso(),
            files_seen: seen,
            files_added: added,
            files_updated: matched,
            files_removed: removed,
            errors_count: errors,
          },
          runnerToken,
        );
        return;
      }

      if (waitingForCheckpoint) {
        if (item.id === resumeCheckpoint) waitingForCheckpoint = false;
        continue;
      }

      seen += 1;
      try {
        const outcome = await options.processItem(item.id);
        if (outcome.updated) {
          matched += 1;
          added += outcome.added ?? 0;
          removed += outcome.removed ?? 0;
        }
      } catch (error) {
        errors += 1;
        await addMetadataJobError(jobId, item.label, error);
      }

      await updateMetadataJob(
        jobId,
        {
          files_seen: seen,
          files_added: added,
          files_updated: matched,
          files_removed: removed,
          errors_count: errors,
          checkpoint_value: item.id,
        },
        runnerToken,
      );
    }

    await updateMetadataJob(
      jobId,
      {
        status: "completed",
        finished_at: nowIso(),
        files_seen: seen,
        files_added: added,
        files_updated: matched,
        files_removed: removed,
        errors_count: errors,
      },
      runnerToken,
    );
  } catch (error) {
    errors += 1;
    await addMetadataJobError(jobId, options.errorLabel, error);
    await db
      .updateTable("scan_job")
      .set({
        status: (await isMetadataJobCancellationRequested(jobId)) ? "cancelled" : "failed",
        finished_at: nowIso(),
        errors_count: sql<number>`errors_count + 1`,
        checkpoint_value: null,
        runner_token: null,
        runner_heartbeat_at: null,
        updated_at: nowIso(),
      })
      .where("id", "=", jobId)
      .where("runner_token", "=", runnerToken)
      .execute();
  } finally {
    runningMetadataRefreshJobs.delete(jobId);
  }
}
