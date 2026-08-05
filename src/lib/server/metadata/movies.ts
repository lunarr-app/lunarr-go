import { sql } from "kysely";
import { getDb } from "../db";
import { createId } from "../id";
import { nowIso } from "../time";
import { lookupMovieMetadataFromPath } from "./matching";
import { movieLookupCandidates } from "./movie-lookup";
import {
  emptyMovieMetadataValues,
  moveMediaShares,
  moveWatchlistEntries,
  moveWatchProgressForFiles,
  movieMetadataValues,
  syncMediaMetadataRelations,
} from "./store";
import { matchMovieMetadata, matchMovieMetadataById, type MatchedMovieMetadata } from "./tmdb";

type MovieMetadataMatcher = (title: string, year: number | null) => Promise<MatchedMovieMetadata | null>;

export type MovieMetadataByIdMatcher = (tmdbId: number) => Promise<MatchedMovieMetadata | null>;

export type RefreshMetadataOptions = {
  metadataMatcher?: MovieMetadataMatcher;
  metadataByIdMatcher?: MovieMetadataByIdMatcher;
  stalenessDays?: number;
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
  if (oldMediaItemId === newMediaItemId) return;
  const db = await getDb();
  const fileRows = await db.selectFrom("media_file").select("id").where("media_item_id", "=", oldMediaItemId).execute();
  await moveWatchProgressForFiles(
    db,
    fileRows.map((file) => file.id),
    oldMediaItemId,
    newMediaItemId,
  );
}

export async function applyMatchedMovieMetadata(
  mediaItemId: string,
  metadata: MatchedMovieMetadata,
  options: { manualMatch?: boolean } = {},
): Promise<string> {
  const db = await getDb();
  const now = nowIso();
  const values = {
    ...movieMetadataValues(metadata, now),
    sort_title: sortTitle(metadata.title),
    ...(options.manualMatch ? { manual_match: 1 } : {}),
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
    await syncMediaMetadataRelations(db, existingProviderItem.id, metadata);
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
    await moveWatchlistEntries(db, mediaItemId, existingProviderItem.id);
    await moveMediaShares(db, mediaItemId, existingProviderItem.id);
    await db.deleteFrom("media_item").where("id", "=", mediaItemId).execute();
    return existingProviderItem.id;
  }

  await db.updateTable("media_item").set(values).where("id", "=", mediaItemId).execute();
  await syncMediaMetadataRelations(db, mediaItemId, metadata);
  return mediaItemId;
}

export type RematchMovieItemFilesResult =
  | { status: "matched"; mediaItemId: string; splitItemIds: string[]; unmatchedFiles: number }
  | { status: "unmatched"; mediaItemId: string | null };

async function createLocalMovieItem(title: string, year: number | null, now: string) {
  const db = await getDb();
  const id = createId();
  await db
    .insertInto("media_item")
    .values({
      id,
      kind: "movie",
      title,
      sort_title: sortTitle(title),
      year,
      release_date: year ? `${year}-01-01` : null,
      ...emptyMovieMetadataValues(),
      parent_id: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  return id;
}

async function findLocalMovieItem(title: string, year: number | null, excludeItemId?: string) {
  const db = await getDb();
  let query = db
    .selectFrom("media_item")
    .select("id")
    .where("kind", "=", "movie")
    .where("provider", "is", null)
    .where("title", "=", title)
    .where((eb) => (year === null ? eb("year", "is", null) : eb("year", "=", year)));
  if (excludeItemId) query = query.where("id", "!=", excludeItemId);
  const item = await query.executeTakeFirst();
  return item?.id ?? null;
}

async function findOrCreateProviderMovieItem(metadata: MatchedMovieMetadata, now: string, excludeItemId?: string) {
  const db = await getDb();
  let query = db
    .selectFrom("media_item")
    .select("id")
    .where("kind", "=", "movie")
    .where("provider", "=", metadata.provider)
    .where("provider_id", "=", metadata.providerId);
  if (excludeItemId) query = query.where("id", "!=", excludeItemId);
  const existing = await query.executeTakeFirst();
  if (existing) return existing.id;
  const id = createId();
  await db
    .insertInto("media_item")
    .values({
      id,
      ...movieMetadataValues(metadata, now),
      kind: "movie",
      sort_title: sortTitle(metadata.title),
      parent_id: null,
      created_at: now,
    })
    .execute();
  await syncMediaMetadataRelations(db, id, metadata);
  return id;
}

async function applyMovieMetadataToItem(mediaItemId: string, metadata: MatchedMovieMetadata) {
  const db = await getDb();
  const values = {
    ...movieMetadataValues(metadata, nowIso()),
    sort_title: sortTitle(metadata.title),
  };
  await db.updateTable("media_item").set(values).where("id", "=", mediaItemId).execute();
  await syncMediaMetadataRelations(db, mediaItemId, metadata);
  return mediaItemId;
}

async function moveMediaFilesToItem(mediaFileIds: string[], fromItemId: string, toItemId: string, now: string) {
  const db = await getDb();
  await db
    .updateTable("media_file")
    .set({ media_item_id: toItemId, updated_at: now })
    .where("id", "in", mediaFileIds)
    .execute();
  await db
    .updateTable("subtitle_track")
    .set({ media_item_id: toItemId, updated_at: now })
    .where("media_file_id", "in", mediaFileIds)
    .execute();
  await moveWatchProgressForFiles(db, mediaFileIds, fromItemId, toItemId);
}

export async function rematchMovieItemFiles(
  mediaItemId: string,
  options: RefreshMetadataOptions = {},
): Promise<RematchMovieItemFilesResult> {
  const db = await getDb();
  const now = nowIso();
  const files = await db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .innerJoin("library", "library.id", "media_file.library_id")
    .select([
      "media_file.id as file_id",
      "media_file.basename as basename",
      "media_file.path as path",
      "media_file.duration_seconds as duration_seconds",
      "library.path as library_path",
      "media_item.provider as provider",
      "media_item.provider_id as provider_id",
    ])
    .where("media_item.id", "=", mediaItemId)
    .where("media_item.kind", "=", "movie")
    .orderBy("media_file.basename", "asc")
    .execute();

  if (files.length === 0) return { status: "unmatched", mediaItemId };

  const metadataMatcher = options.metadataMatcher ?? matchMovieMetadata;
  const groups: Array<{ metadata: MatchedMovieMetadata; fileIds: string[] }> = [];
  const groupIndex = new Map<string, number>();
  const unmatched: Array<{ fileId: string; path: string | null; basename: string; libraryPath: string | null }> = [];

  for (const file of files) {
    const lookup = await lookupMovieMetadataFromPath(file.path ?? file.basename ?? "", {
      libraryRoot: file.library_path,
      fileRuntimeSeconds: file.duration_seconds,
      matcher: metadataMatcher,
    });
    const metadata = lookup?.metadata ?? null;
    if (!metadata) {
      unmatched.push({
        fileId: file.file_id,
        path: file.path,
        basename: file.basename,
        libraryPath: file.library_path,
      });
      continue;
    }
    const key = `${metadata.provider}:${metadata.providerId}`;
    const existingIndex = groupIndex.get(key);
    if (existingIndex === undefined) {
      groupIndex.set(key, groups.length);
      groups.push({ metadata, fileIds: [file.file_id] });
    } else {
      groups[existingIndex].fileIds.push(file.file_id);
    }
  }

  const movedToIds = new Set<string>();
  const localItemsByKey = new Map<string, string>();

  const originalProviderIndex = groups.findIndex(
    (group) => group.metadata.provider === files[0].provider && group.metadata.providerId === files[0].provider_id,
  );
  if (originalProviderIndex > 0) {
    const [group] = groups.splice(originalProviderIndex, 1);
    groups.unshift(group);
  }

  for (const file of unmatched) {
    const candidates = movieLookupCandidates(file.path ?? file.basename ?? "", undefined, {
      libraryRoot: file.libraryPath,
    });
    const parsed = candidates[0] ?? { title: file.basename, year: null };
    const localKey = `${parsed.title}:${parsed.year ?? ""}`;
    let localItemId = localItemsByKey.get(localKey) ?? null;
    if (!localItemId) {
      localItemId =
        (await findLocalMovieItem(parsed.title, parsed.year, mediaItemId)) ??
        (await createLocalMovieItem(parsed.title, parsed.year, now));
      localItemsByKey.set(localKey, localItemId);
    }
    await moveMediaFilesToItem([file.fileId], mediaItemId, localItemId, now);
    movedToIds.add(localItemId);
  }

  for (const group of groups.slice(1)) {
    const targetId = await findOrCreateProviderMovieItem(group.metadata, now, mediaItemId);
    await applyMovieMetadataToItem(targetId, group.metadata);
    await moveMediaFilesToItem(group.fileIds, mediaItemId, targetId, now);
    movedToIds.add(targetId);
  }

  if (groups.length === 0) {
    const firstTarget = movedToIds.values().next().value;
    if (firstTarget) {
      await moveWatchlistEntries(db, mediaItemId, firstTarget);
      await moveMediaShares(db, mediaItemId, firstTarget);
    }
    await db.deleteFrom("media_item").where("id", "=", mediaItemId).execute();
    return { status: "unmatched", mediaItemId: null };
  }

  const primary = groups[0];
  const finalMediaItemId = await applyMatchedMovieMetadata(mediaItemId, primary.metadata);
  const splitItemIds = [...movedToIds].filter((id) => id !== finalMediaItemId);
  return {
    status: "matched",
    mediaItemId: finalMediaItemId,
    splitItemIds,
    unmatchedFiles: unmatched.length,
  };
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
      "media_item.provider",
      "media_item.provider_id",
      "media_item.manual_match",
      "media_file.basename as basename",
      "media_file.path as path",
      "media_file.duration_seconds as duration_seconds",
      "library.path as library_path",
    ])
    .where("media_item.id", "=", mediaItemId)
    .where("media_item.kind", "=", "movie")
    .orderBy("media_file.basename", "asc")
    .executeTakeFirst();

  if (!movie) return { status: "missing", mediaItemId: null };

  let metadata: MatchedMovieMetadata | null = null;

  if (movie.manual_match && movie.provider === "tmdb" && movie.provider_id) {
    const metadataByIdMatcher = options.metadataByIdMatcher ?? matchMovieMetadataById;
    metadata = await metadataByIdMatcher(Number(movie.provider_id));
  } else {
    const metadataMatcher = options.metadataMatcher ?? matchMovieMetadata;
    const lookup =
      (await lookupMovieMetadataFromPath(movie.path ?? movie.basename ?? "", {
        libraryRoot: movie.library_path,
        fileRuntimeSeconds: movie.duration_seconds,
        fallback: {
          title: movie.title,
          year: movie.year,
        },
        matcher: metadataMatcher,
      })) ?? null;
    metadata = lookup?.metadata ?? null;
  }

  if (!metadata) return { status: "unmatched", mediaItemId };

  const finalMediaItemId = await applyMatchedMovieMetadata(mediaItemId, metadata);
  return { status: "matched", mediaItemId: finalMediaItemId };
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

    const moviesQuery = db
      .selectFrom("media_item")
      .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
      .select(["media_item.id", "media_item.title", "media_item.sort_title", "media_item.updated_at"])
      .where("media_item.kind", "=", "movie")
      .groupBy("media_item.id")
      .orderBy("media_item.sort_title", "asc");

    const movies =
      options.stalenessDays && options.stalenessDays > 0
        ? await moviesQuery
            .where(sql<boolean>`media_item.updated_at < datetime('now', '-' || ${options.stalenessDays} || ' days')`)
            .execute()
        : await moviesQuery.execute();

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
