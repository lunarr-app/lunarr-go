import { sql } from "kysely";
import { getDb } from "../db";
import { createId } from "../id";
import { nowIso } from "../time";
import { lookupMovieMetadataFromPath } from "./matching";
import { movieMetadataValues, syncMovieMetadataRelations } from "./store";
import { matchMovieMetadata, type MatchedMovieMetadata } from "./tmdb";

type MovieMetadataMatcher = (title: string, year: number | null) => Promise<MatchedMovieMetadata | null>;

export type RefreshMetadataOptions = {
  metadataMatcher?: MovieMetadataMatcher;
};

export type RefreshMovieMetadataResult =
  | { status: "matched"; mediaItemId: string }
  | { status: "unmatched"; mediaItemId: string }
  | { status: "missing"; mediaItemId: null };

const runningMovieMetadataJobs = new Set<string>();

function isTerminalJobStatus(status: "queued" | "running" | "completed" | "failed" | "cancelled") {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function sortTitle(title: string) {
  return title.replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

async function moveWatchProgress(oldMediaItemId: string, newMediaItemId: string) {
  const db = await getDb();
  const progressRows = await db
    .selectFrom("watch_progress")
    .selectAll()
    .where("media_item_id", "=", oldMediaItemId)
    .execute();

  for (const progress of progressRows) {
    const existingProgress = await db
      .selectFrom("watch_progress")
      .selectAll()
      .where("user_id", "=", progress.user_id)
      .where("media_item_id", "=", newMediaItemId)
      .where("media_file_id", "=", progress.media_file_id)
      .executeTakeFirst();

    if (existingProgress) {
      if (new Date(progress.updated_at).getTime() >= new Date(existingProgress.updated_at).getTime()) {
        await db
          .updateTable("watch_progress")
          .set({
            position_seconds: progress.position_seconds,
            duration_seconds: progress.duration_seconds,
            completed: progress.completed,
            updated_at: progress.updated_at,
          })
          .where("user_id", "=", progress.user_id)
          .where("media_item_id", "=", newMediaItemId)
          .where("media_file_id", "=", progress.media_file_id)
          .execute();
      }

      await db
        .deleteFrom("watch_progress")
        .where("user_id", "=", progress.user_id)
        .where("media_item_id", "=", oldMediaItemId)
        .where("media_file_id", "=", progress.media_file_id)
        .execute();
    } else {
      await db
        .updateTable("watch_progress")
        .set({ media_item_id: newMediaItemId })
        .where("user_id", "=", progress.user_id)
        .where("media_item_id", "=", oldMediaItemId)
        .where("media_file_id", "=", progress.media_file_id)
        .execute();
    }
  }
}

export async function refreshMovieMetadataResult(
  mediaItemId: string,
  options: RefreshMetadataOptions = {},
): Promise<RefreshMovieMetadataResult> {
  const db = await getDb();
  const movie = await db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .innerJoin("library", "library.id", "media_file.library_id")
    .select([
      "media_item.id",
      "media_item.title",
      "media_item.year",
      "media_file.basename as basename",
      "media_file.path as path",
      "library.path as library_path",
    ])
    .where("media_item.id", "=", mediaItemId)
    .where("media_item.kind", "=", "movie")
    .orderBy("media_file.basename", "asc")
    .executeTakeFirst();

  if (!movie) return { status: "missing", mediaItemId: null };

  const metadataMatcher = options.metadataMatcher ?? matchMovieMetadata;
  const metadata =
    (await lookupMovieMetadataFromPath(movie.path ?? movie.basename ?? "", {
      libraryRoot: movie.library_path,
      fallback: {
        title: movie.title,
        year: movie.year,
      },
      matcher: metadataMatcher,
    })) ?? null;
  if (!metadata) return { status: "unmatched", mediaItemId };

  const now = nowIso();
  const values = {
    ...movieMetadataValues(metadata, now),
    sort_title: sortTitle(metadata.title),
  };

  const existingProviderItem = await db
    .selectFrom("media_item")
    .select(["id"])
    .where("kind", "=", "movie")
    .where("provider", "=", metadata.provider)
    .where("provider_id", "=", metadata.providerId)
    .where("id", "!=", mediaItemId)
    .executeTakeFirst();

  if (existingProviderItem) {
    await db.updateTable("media_item").set(values).where("id", "=", existingProviderItem.id).execute();
    await syncMovieMetadataRelations(db, existingProviderItem.id, metadata);
    await moveWatchProgress(mediaItemId, existingProviderItem.id);
    await db
      .updateTable("media_file")
      .set({ media_item_id: existingProviderItem.id, updated_at: now })
      .where("media_item_id", "=", mediaItemId)
      .execute();
    await db
      .updateTable("subtitle_track")
      .set({ media_item_id: existingProviderItem.id, updated_at: now })
      .where("media_item_id", "=", mediaItemId)
      .execute();
    await db.deleteFrom("media_item").where("id", "=", mediaItemId).execute();
    return { status: "matched", mediaItemId: existingProviderItem.id };
  }

  await db.updateTable("media_item").set(values).where("id", "=", mediaItemId).execute();
  await syncMovieMetadataRelations(db, mediaItemId, metadata);

  return { status: "matched", mediaItemId };
}

async function addMetadataJobError(jobId: string, item: string, error: unknown) {
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

async function updateMetadataJob(
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

async function getActiveMovieMetadataJobId() {
  const db = await getDb();
  const job = await db
    .selectFrom("scan_job")
    .select("id")
    .where("job_kind", "=", "movie_metadata_refresh")
    .where("library_id", "is", null)
    .where("status", "in", ["queued", "running"])
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  return job?.id ?? null;
}

async function isMetadataJobCancellationRequested(jobId: string) {
  const db = await getDb();
  const job = await db.selectFrom("scan_job").select("cancel_requested_at").where("id", "=", jobId).executeTakeFirst();
  return Boolean(job?.cancel_requested_at);
}

async function createMovieMetadataRefreshJob() {
  const activeJobId = await getActiveMovieMetadataJobId();
  if (activeJobId) return { id: activeJobId, existing: true };

  const db = await getDb();
  const now = nowIso();
  const id = createId();
  try {
    await db
      .insertInto("scan_job")
      .values({
        id,
        job_kind: "movie_metadata_refresh",
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
    const activeJobId = await getActiveMovieMetadataJobId();
    if (activeJobId) return { id: activeJobId, existing: true };
    throw error;
  }

  return { id, existing: false };
}

export async function runMovieMetadataRefreshJob(jobId: string, options: RefreshMetadataOptions = {}) {
  if (runningMovieMetadataJobs.has(jobId)) return;
  runningMovieMetadataJobs.add(jobId);

  const db = await getDb();
  const runnerToken = createId();
  let seen = 0;
  let matched = 0;
  let merged = 0;
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
    merged = isResume ? job.files_removed : 0;
    errors = isResume ? job.errors_count : 0;
    resumeCheckpoint = isResume ? job.checkpoint_value : null;

    const movies = await db
      .selectFrom("media_item")
      .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
      .select(["media_item.id", "media_item.title", "media_item.sort_title"])
      .where("media_item.kind", "=", "movie")
      .groupBy("media_item.id")
      .orderBy("media_item.sort_title", "asc")
      .execute();

    if (resumeCheckpoint && !movies.some((movie) => movie.id === resumeCheckpoint)) {
      seen = 0;
      matched = 0;
      merged = 0;
      errors = 0;
      resumeCheckpoint = null;
      await db.deleteFrom("scan_job_error").where("scan_job_id", "=", jobId).execute();
      await updateMetadataJob(
        jobId,
        {
          files_seen: 0,
          files_updated: 0,
          files_removed: 0,
          errors_count: 0,
          checkpoint_value: null,
        },
        runnerToken,
      );
    }
    waitingForCheckpoint = resumeCheckpoint !== null;

    for (const movie of movies) {
      if (await isMetadataJobCancellationRequested(jobId)) {
        await updateMetadataJob(
          jobId,
          {
            status: "cancelled",
            finished_at: nowIso(),
            files_seen: seen,
            files_updated: matched,
            files_removed: merged,
            errors_count: errors,
          },
          runnerToken,
        );
        return;
      }

      if (waitingForCheckpoint) {
        if (movie.id === resumeCheckpoint) waitingForCheckpoint = false;
        continue;
      }

      seen += 1;
      try {
        const result = await refreshMovieMetadataResult(movie.id, options);
        if (result.status === "matched") {
          matched += 1;
          if (result.mediaItemId !== movie.id) merged += 1;
        }
      } catch (error) {
        errors += 1;
        await addMetadataJobError(jobId, movie.title || movie.id, error);
      }

      await updateMetadataJob(
        jobId,
        {
          files_seen: seen,
          files_updated: matched,
          files_removed: merged,
          errors_count: errors,
          checkpoint_value: movie.id,
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
        files_updated: matched,
        files_removed: merged,
        errors_count: errors,
      },
      runnerToken,
    );
  } catch (error) {
    errors += 1;
    await addMetadataJobError(jobId, "movie metadata refresh", error);
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
    runningMovieMetadataJobs.delete(jobId);
  }
}

export async function startMovieMetadataRefreshJob(options: RefreshMetadataOptions = {}) {
  const job = await createMovieMetadataRefreshJob();
  if (!job.existing) void runMovieMetadataRefreshJob(job.id, options);
  return job;
}
