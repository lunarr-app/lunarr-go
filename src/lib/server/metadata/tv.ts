import { sql } from "kysely";
import { getDb } from "../db";
import { createId } from "../id";
import { nowIso } from "../time";
import {
  syncTvShowMetadataRelations,
  tvEpisodeMetadataValues,
  tvSeasonMetadataValues,
  tvShowMetadataValues,
} from "./store";
import {
  matchTvSeasonMetadata,
  type MatchedTvEpisodeMetadata,
  type MatchedTvSeasonLookup,
  type MatchedTvSeasonMetadata,
  type MatchedTvShowMetadata,
} from "./tmdb";

export const TV_SHOW_CREATOR_JOBS = ["Creator", "Developer", "Original Series Creator", "Series Creator"] as const;

type TvSeasonMetadataMatcher = (
  title: string,
  year: number | null,
  seasonNumber: number,
) => Promise<MatchedTvSeasonLookup | null>;

export type RefreshTvMetadataOptions = {
  metadataMatcher?: TvSeasonMetadataMatcher;
  stalenessDays?: number;
};

type RefreshTvSeasonMetadataResult =
  | { status: "matched"; addedEpisodes: number; showId: string }
  | { status: "unmatched"; addedEpisodes: 0 }
  | { status: "missing"; addedEpisodes: 0 };

export type RefreshTvShowMetadataResult =
  | {
      status: "matched";
      mediaItemId: string;
      matchedSeasons: number;
      unmatchedSeasons: number;
      addedEpisodes: number;
    }
  | { status: "unmatched"; mediaItemId: string }
  | { status: "no_seasons"; mediaItemId: string }
  | { status: "missing"; mediaItemId: null };

const runningTvMetadataJobs = new Set<string>();

function isTerminalJobStatus(status: "queued" | "running" | "completed" | "failed" | "cancelled") {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function sortTitle(title: string) {
  return title.replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

function episodeSortTitle(seasonNumber: number, episodeNumber: number) {
  return `s${seasonNumber.toString().padStart(3, "0")}e${episodeNumber.toString().padStart(4, "0")}`;
}

async function mergeChildItems(oldParentId: string, newParentId: string, now: string) {
  const db = await getDb();
  await db
    .updateTable("media_item")
    .set({ parent_id: newParentId, updated_at: now })
    .where("parent_id", "=", oldParentId)
    .execute();
  await db.deleteFrom("media_item").where("id", "=", oldParentId).where("provider", "is", null).execute();
}

export async function moveEpisodeAssociations(oldMediaItemId: string, newMediaItemId: string, now: string) {
  if (oldMediaItemId === newMediaItemId) return;

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

  await db
    .updateTable("media_file")
    .set({ media_item_id: newMediaItemId, updated_at: now })
    .where("media_item_id", "=", oldMediaItemId)
    .execute();
  await db
    .updateTable("subtitle_track")
    .set({ media_item_id: newMediaItemId, updated_at: now })
    .where("media_item_id", "=", oldMediaItemId)
    .execute();
  await db.deleteFrom("media_item").where("id", "=", oldMediaItemId).where("provider", "is", null).execute();
}

async function upsertShowMetadata(currentShowId: string, metadata: MatchedTvShowMetadata, now: string) {
  const db = await getDb();
  const values = {
    ...tvShowMetadataValues(metadata, now),
    kind: "show" as const,
    sort_title: sortTitle(metadata.title),
    season_number: null,
    episode_number: null,
    parent_id: null,
  };
  const providerExisting = await db
    .selectFrom("media_item")
    .select("id")
    .where("kind", "=", "show")
    .where("provider", "=", metadata.provider)
    .where("provider_id", "=", metadata.providerId)
    .where("id", "!=", currentShowId)
    .executeTakeFirst();
  const targetId = providerExisting?.id ?? currentShowId;

  await db.updateTable("media_item").set(values).where("id", "=", targetId).execute();
  await syncTvShowMetadataRelations(db, targetId, metadata);
  if (providerExisting) await mergeChildItems(currentShowId, targetId, now);

  return targetId;
}

async function upsertSeasonMetadata(
  showId: string,
  currentSeasonId: string,
  metadata: MatchedTvSeasonMetadata,
  now: string,
) {
  const db = await getDb();
  const values = {
    ...tvSeasonMetadataValues(metadata, now),
    kind: "season" as const,
    sort_title: metadata.seasonNumber.toString().padStart(4, "0"),
    parent_id: showId,
  };
  const providerExisting = await db
    .selectFrom("media_item")
    .select("id")
    .where("kind", "=", "season")
    .where("provider", "=", metadata.provider)
    .where("provider_id", "=", metadata.providerId)
    .where("id", "!=", currentSeasonId)
    .executeTakeFirst();
  const targetId = providerExisting?.id ?? currentSeasonId;

  await db.updateTable("media_item").set(values).where("id", "=", targetId).execute();
  if (providerExisting) await mergeChildItems(currentSeasonId, targetId, now);

  return targetId;
}

async function upsertEpisodeMetadata(seasonId: string, metadata: MatchedTvEpisodeMetadata, now: string) {
  const db = await getDb();
  const values = {
    ...tvEpisodeMetadataValues(metadata, now),
    kind: "episode" as const,
    sort_title: episodeSortTitle(metadata.seasonNumber, metadata.episodeNumber),
    parent_id: seasonId,
  };
  const providerExisting = await db
    .selectFrom("media_item")
    .select("id")
    .where("kind", "=", "episode")
    .where("provider", "=", metadata.provider)
    .where("provider_id", "=", metadata.providerId)
    .executeTakeFirst();
  const libraryExisting = await db
    .selectFrom("media_item")
    .select("id")
    .where("kind", "=", "episode")
    .where("parent_id", "=", seasonId)
    .where("season_number", "=", metadata.seasonNumber)
    .where("episode_number", "=", metadata.episodeNumber)
    .executeTakeFirst();

  if (providerExisting) {
    await db.updateTable("media_item").set(values).where("id", "=", providerExisting.id).execute();
    if (libraryExisting && libraryExisting.id !== providerExisting.id) {
      await moveEpisodeAssociations(libraryExisting.id, providerExisting.id, now);
    }
    return { id: providerExisting.id, created: false };
  }

  if (libraryExisting) {
    await db.updateTable("media_item").set(values).where("id", "=", libraryExisting.id).execute();
    return { id: libraryExisting.id, created: false };
  }

  const id = createId();
  await db
    .insertInto("media_item")
    .values({ id, ...values, created_at: now })
    .execute();
  return { id, created: true };
}

async function refreshTvSeasonMetadataResult(
  seasonId: string,
  options: RefreshTvMetadataOptions = {},
): Promise<RefreshTvSeasonMetadataResult> {
  const db = await getDb();
  const season = await db
    .selectFrom("media_item as season")
    .innerJoin("media_item as show", "show.id", "season.parent_id")
    .select([
      "season.id",
      "season.season_number",
      "show.id as show_id",
      "show.title as show_title",
      "show.year as show_year",
    ])
    .where("season.id", "=", seasonId)
    .where("season.kind", "=", "season")
    .where("show.kind", "=", "show")
    .executeTakeFirst();

  if (!season || season.season_number === null) return { status: "missing", addedEpisodes: 0 };

  const metadataMatcher = options.metadataMatcher ?? matchTvSeasonMetadata;
  const metadata = await metadataMatcher(season.show_title, season.show_year, season.season_number);
  if (!metadata) return { status: "unmatched", addedEpisodes: 0 };

  const now = nowIso();
  const showId = await upsertShowMetadata(season.show_id, metadata.show, now);
  const updatedSeasonId = await upsertSeasonMetadata(showId, season.id, metadata.season, now);
  let addedEpisodes = 0;
  for (const episode of metadata.episodes) {
    const result = await upsertEpisodeMetadata(updatedSeasonId, episode, now);
    if (result.created) addedEpisodes += 1;
  }

  return { status: "matched", addedEpisodes, showId };
}

export async function refreshTvShowMetadataResult(
  showId: string,
  options: RefreshTvMetadataOptions = {},
): Promise<RefreshTvShowMetadataResult> {
  const db = await getDb();
  const show = await db
    .selectFrom("media_item")
    .select("id")
    .where("id", "=", showId)
    .where("kind", "=", "show")
    .executeTakeFirst();

  if (!show) return { status: "missing", mediaItemId: null };

  const seasons = await db
    .selectFrom("media_item")
    .select("id")
    .where("parent_id", "=", showId)
    .where("kind", "=", "season")
    .where("season_number", "is not", null)
    .orderBy("season_number", "asc")
    .execute();

  if (seasons.length === 0) return { status: "no_seasons", mediaItemId: showId };

  let mediaItemId = showId;
  let matchedSeasons = 0;
  let unmatchedSeasons = 0;
  let addedEpisodes = 0;

  for (const season of seasons) {
    const result = await refreshTvSeasonMetadataResult(season.id, options);
    if (result.status === "matched") {
      matchedSeasons += 1;
      addedEpisodes += result.addedEpisodes;
      mediaItemId = result.showId;
    } else if (result.status === "unmatched") {
      unmatchedSeasons += 1;
    }
  }

  if (matchedSeasons === 0) return { status: "unmatched", mediaItemId };

  return { status: "matched", mediaItemId, matchedSeasons, unmatchedSeasons, addedEpisodes };
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

async function getActiveTvMetadataJobId() {
  const db = await getDb();
  const job = await db
    .selectFrom("scan_job")
    .select("id")
    .where("job_kind", "=", "tv_metadata_refresh")
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

async function createTvMetadataRefreshJob() {
  const activeJobId = await getActiveTvMetadataJobId();
  if (activeJobId) return { id: activeJobId, existing: true };

  const db = await getDb();
  const now = nowIso();
  const id = createId();
  try {
    await db
      .insertInto("scan_job")
      .values({
        id,
        job_kind: "tv_metadata_refresh",
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
    const activeJobId = await getActiveTvMetadataJobId();
    if (activeJobId) return { id: activeJobId, existing: true };
    throw error;
  }

  return { id, existing: false };
}

export async function runTvMetadataRefreshJob(jobId: string, options: RefreshTvMetadataOptions = {}) {
  if (runningTvMetadataJobs.has(jobId)) return;
  runningTvMetadataJobs.add(jobId);

  const db = await getDb();
  const runnerToken = createId();
  let seen = 0;
  let matched = 0;
  let addedEpisodes = 0;
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
    addedEpisodes = isResume ? job.files_added : 0;
    matched = isResume ? job.files_updated : 0;
    errors = isResume ? job.errors_count : 0;
    resumeCheckpoint = isResume ? job.checkpoint_value : null;

    const seasonsQuery = db
      .selectFrom("media_item as season")
      .innerJoin("media_item as show", "show.id", "season.parent_id")
      .select(["season.id", "season.title", "season.season_number", "season.updated_at", "show.title as show_title"])
      .where("season.kind", "=", "season")
      .where("show.kind", "=", "show")
      .where("season.season_number", "is not", null)
      .orderBy("show.sort_title", "asc")
      .orderBy("season.season_number", "asc");

    const seasons =
      options.stalenessDays && options.stalenessDays > 0
        ? await seasonsQuery
            .where(sql<boolean>`season.updated_at < datetime('now', '-' || ${options.stalenessDays} || ' days')`)
            .execute()
        : await seasonsQuery.execute();

    if (resumeCheckpoint && !seasons.some((season) => season.id === resumeCheckpoint)) {
      seen = 0;
      addedEpisodes = 0;
      matched = 0;
      errors = 0;
      resumeCheckpoint = null;
      await db.deleteFrom("scan_job_error").where("scan_job_id", "=", jobId).execute();
      await updateMetadataJob(
        jobId,
        {
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          errors_count: 0,
          checkpoint_value: null,
        },
        runnerToken,
      );
    }
    waitingForCheckpoint = resumeCheckpoint !== null;

    for (const season of seasons) {
      if (await isMetadataJobCancellationRequested(jobId)) {
        await updateMetadataJob(
          jobId,
          {
            status: "cancelled",
            finished_at: nowIso(),
            files_seen: seen,
            files_added: addedEpisodes,
            files_updated: matched,
            errors_count: errors,
          },
          runnerToken,
        );
        return;
      }

      if (waitingForCheckpoint) {
        if (season.id === resumeCheckpoint) waitingForCheckpoint = false;
        continue;
      }

      seen += 1;
      try {
        const result = await refreshTvSeasonMetadataResult(season.id, options);
        if (result.status === "matched") {
          matched += 1;
          addedEpisodes += result.addedEpisodes;
        }
      } catch (error) {
        errors += 1;
        await addMetadataJobError(jobId, `${season.show_title} ${season.title}`, error);
      }

      await updateMetadataJob(
        jobId,
        {
          files_seen: seen,
          files_added: addedEpisodes,
          files_updated: matched,
          errors_count: errors,
          checkpoint_value: season.id,
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
        files_added: addedEpisodes,
        files_updated: matched,
        errors_count: errors,
      },
      runnerToken,
    );
  } catch (error) {
    errors += 1;
    await addMetadataJobError(jobId, "TV metadata refresh", error);
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
    runningTvMetadataJobs.delete(jobId);
  }
}

export async function startTvMetadataRefreshJob(options: RefreshTvMetadataOptions = {}) {
  const job = await createTvMetadataRefreshJob();
  if (!job.existing) void runTvMetadataRefreshJob(job.id, options);
  return job;
}
