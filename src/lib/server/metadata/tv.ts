import { sql } from "kysely";
import { getDb } from "../db";
import { createId } from "../id";
import { nowIso } from "../time";
import { parseTvEpisodePath } from "../scanner/tv-parser";
import {
  emptyMovieMetadataValues,
  moveMediaShares,
  moveWatchlistEntries,
  remapShareSeasonId,
  syncMediaMetadataRelations,
  tvEpisodeMetadataValues,
  tvSeasonMetadataValues,
  tvShowMetadataValues,
} from "./store";
import {
  matchTvSeasonMetadata,
  matchTvSeasonMetadataById,
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

export type TvSeasonMetadataByIdMatcher = (
  tmdbId: number,
  seasonNumber: number,
) => Promise<MatchedTvSeasonLookup | null>;

export type RefreshTvMetadataOptions = {
  metadataMatcher?: TvSeasonMetadataMatcher;
  metadataByIdMatcher?: TvSeasonMetadataByIdMatcher;
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
  await moveWatchlistEntries(db, oldParentId, newParentId);
  await moveMediaShares(db, oldParentId, newParentId);
  await db.deleteFrom("media_item").where("id", "=", oldParentId).execute();
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
  await moveWatchlistEntries(db, oldMediaItemId, newMediaItemId);
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
  await syncMediaMetadataRelations(db, targetId, metadata);
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
  if (providerExisting) {
    await mergeChildItems(currentSeasonId, targetId, now);
    await remapShareSeasonId(db, currentSeasonId, targetId);
  }

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

export async function applyMatchedTvSeasonMetadata(
  showId: string,
  seasonId: string,
  metadata: MatchedTvSeasonLookup,
): Promise<{ addedEpisodes: number; showId: string }> {
  const now = nowIso();
  const updatedShowId = await upsertShowMetadata(showId, metadata.show, now);
  const updatedSeasonId = await upsertSeasonMetadata(updatedShowId, seasonId, metadata.season, now);
  let addedEpisodes = 0;
  for (const episode of metadata.episodes) {
    const result = await upsertEpisodeMetadata(updatedSeasonId, episode, now);
    if (result.created) addedEpisodes += 1;
  }

  return { addedEpisodes, showId: updatedShowId };
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
      "show.provider as show_provider",
      "show.provider_id as show_provider_id",
      "show.manual_match as show_manual_match",
    ])
    .where("season.id", "=", seasonId)
    .where("season.kind", "=", "season")
    .where("show.kind", "=", "show")
    .executeTakeFirst();

  if (!season || season.season_number === null) return { status: "missing", addedEpisodes: 0 };

  let metadata: MatchedTvSeasonLookup | null;
  if (season.show_manual_match && season.show_provider === "tmdb" && season.show_provider_id) {
    const metadataByIdMatcher = options.metadataByIdMatcher ?? matchTvSeasonMetadataById;
    metadata = await metadataByIdMatcher(Number(season.show_provider_id), season.season_number);
  } else {
    const metadataMatcher = options.metadataMatcher ?? matchTvSeasonMetadata;
    metadata = await metadataMatcher(season.show_title, season.show_year, season.season_number);
  }
  if (!metadata) return { status: "unmatched", addedEpisodes: 0 };

  const result = await applyMatchedTvSeasonMetadata(season.show_id, season.id, metadata);
  return { status: "matched", addedEpisodes: result.addedEpisodes, showId: result.showId };
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

export type RematchTvShowSeasonsResult =
  | {
      status: "matched";
      mediaItemId: string;
      splitShowIds: string[];
      matchedSeasons: number;
      unmatchedSeasons: number;
    }
  | { status: "unmatched"; mediaItemId: string | null }
  | { status: "no_seasons"; mediaItemId: string }
  | { status: "missing"; mediaItemId: null };

async function findOrCreateProviderShowItem(metadata: MatchedTvShowMetadata, now: string, excludeShowId?: string) {
  const db = await getDb();
  const values = {
    ...tvShowMetadataValues(metadata, now),
    kind: "show" as const,
    sort_title: sortTitle(metadata.title),
    season_number: null,
    episode_number: null,
    parent_id: null,
  };
  let query = db
    .selectFrom("media_item")
    .select("id")
    .where("kind", "=", "show")
    .where("provider", "=", metadata.provider)
    .where("provider_id", "=", metadata.providerId);
  if (excludeShowId) query = query.where("id", "!=", excludeShowId);
  const existing = await query.executeTakeFirst();
  if (existing) return existing.id;
  const id = createId();
  await db
    .insertInto("media_item")
    .values({ id, ...values, created_at: now })
    .execute();
  await syncMediaMetadataRelations(db, id, metadata);
  return id;
}

async function findOrCreateLocalShowItem(title: string, now: string, excludeShowId?: string) {
  const db = await getDb();
  let query = db
    .selectFrom("media_item")
    .select("id")
    .where("kind", "=", "show")
    .where("title", "=", title)
    .where("provider", "is", null);
  if (excludeShowId) query = query.where("id", "!=", excludeShowId);
  const existing = await query.executeTakeFirst();
  if (existing) return existing.id;
  const id = createId();
  await db
    .insertInto("media_item")
    .values({
      id,
      kind: "show",
      title,
      sort_title: sortTitle(title),
      year: null,
      season_number: null,
      episode_number: null,
      release_date: null,
      ...emptyMovieMetadataValues(),
      parent_id: null,
      updated_at: now,
      created_at: now,
    })
    .execute();
  return id;
}

async function moveSeasonToShow(seasonId: string, targetShowId: string, now: string) {
  const db = await getDb();
  await db
    .updateTable("media_item")
    .set({ parent_id: targetShowId, provider: null, provider_id: null, updated_at: now })
    .where("id", "=", seasonId)
    .execute();
}

export async function rematchTvShowSeasons(
  showId: string,
  options: RefreshTvMetadataOptions = {},
): Promise<RematchTvShowSeasonsResult> {
  const db = await getDb();
  const show = await db
    .selectFrom("media_item")
    .select(["id", "title", "provider", "provider_id"])
    .where("id", "=", showId)
    .where("kind", "=", "show")
    .executeTakeFirst();
  if (!show) return { status: "missing", mediaItemId: null };

  const seasons = await db
    .selectFrom("media_item")
    .select(["id", "season_number"])
    .where("parent_id", "=", showId)
    .where("kind", "=", "season")
    .where("season_number", "is not", null)
    .orderBy("season_number", "asc")
    .execute();
  if (seasons.length === 0) return { status: "no_seasons", mediaItemId: showId };

  const metadataMatcher = options.metadataMatcher ?? matchTvSeasonMetadata;
  const now = nowIso();
  const groups: Array<{ entries: Array<{ seasonId: string; lookup: MatchedTvSeasonLookup }> }> = [];
  const groupIndex = new Map<string, number>();
  const unmatched: Array<{ seasonId: string; title: string }> = [];

  for (const season of seasons) {
    const episodeFile = await db
      .selectFrom("media_item as episode")
      .innerJoin("media_file", "media_file.media_item_id", "episode.id")
      .innerJoin("library", "library.id", "media_file.library_id")
      .select(["media_file.path as path", "library.path as library_path"])
      .where("episode.parent_id", "=", season.id)
      .where("episode.kind", "=", "episode")
      .orderBy("media_file.basename", "asc")
      .limit(1)
      .executeTakeFirst();
    const parsed = episodeFile
      ? parseTvEpisodePath(episodeFile.path ?? "", episodeFile.library_path ?? undefined)
      : null;
    const title = parsed?.showTitle || show.title;
    const lookup = await metadataMatcher(title, null, season.season_number as number);
    if (!lookup) {
      unmatched.push({ seasonId: season.id, title });
      continue;
    }
    const key = `${lookup.show.provider}:${lookup.show.providerId}`;
    const existingIndex = groupIndex.get(key);
    if (existingIndex === undefined) {
      groupIndex.set(key, groups.length);
      groups.push({ entries: [{ seasonId: season.id, lookup }] });
    } else {
      groups[existingIndex].entries.push({ seasonId: season.id, lookup });
    }
  }

  const splitShowIds = new Set<string>();

  const originalProviderIndex = groups.findIndex(
    (group) =>
      group.entries[0].lookup.show.provider === show.provider &&
      group.entries[0].lookup.show.providerId === show.provider_id,
  );
  if (originalProviderIndex > 0) {
    const [group] = groups.splice(originalProviderIndex, 1);
    groups.unshift(group);
  }

  for (const season of unmatched) {
    const targetShowId = await findOrCreateLocalShowItem(season.title, now, showId);
    await moveSeasonToShow(season.seasonId, targetShowId, now);
    splitShowIds.add(targetShowId);
  }

  for (const group of groups.slice(1)) {
    const targetShowId = await findOrCreateProviderShowItem(group.entries[0].lookup.show, now, showId);
    for (const entry of group.entries) {
      await applyMatchedTvSeasonMetadata(targetShowId, entry.seasonId, entry.lookup);
    }
    splitShowIds.add(targetShowId);
  }

  if (groups.length === 0) {
    const firstTarget = splitShowIds.values().next().value;
    if (firstTarget) {
      await moveWatchlistEntries(db, showId, firstTarget);
      await moveMediaShares(db, showId, firstTarget);
    }
    await db.deleteFrom("media_item").where("id", "=", showId).execute();
    return { status: "unmatched", mediaItemId: null };
  }

  let mediaItemId = showId;
  for (const entry of groups[0].entries) {
    const result = await applyMatchedTvSeasonMetadata(showId, entry.seasonId, entry.lookup);
    mediaItemId = result.showId;
  }

  return {
    status: "matched",
    mediaItemId,
    splitShowIds: [...splitShowIds],
    matchedSeasons: groups.reduce((total, group) => total + group.entries.length, 0),
    unmatchedSeasons: unmatched.length,
  };
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
