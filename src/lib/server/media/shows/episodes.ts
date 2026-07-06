import type { ShowRowsResponse } from "$lib/media/types";
import { sql, type Kysely } from "kysely";
import { tmdbImageUrl } from "$lib/media/images";
import { getDb } from "../../db";
import type { Database } from "../../db/schema";
import {
  BROWSE_RAIL_LIMIT,
  SHOW_PAGE_SIZE,
  accessibleLibrarySql,
  catalogPageSize,
  normalizePage,
  paginatedGroupedRail,
  paginatedSlice,
  type ShowSort,
  type ShowBrowseRail,
} from "../catalog";
import { publicMovieSummary, summarizeMovieProgress } from "../progress";
import {
  continueMaxAgeCutoffSqlForDays,
  continueMaxAgeEnabledForDays,
  getContinueMaxAgeDays,
  isContinueProgressFresh,
  MIN_CONTINUE_POSITION_SECONDS,
} from "../continue-max-age";
import type { EpisodeBrowseRow } from "../types";
import { showBrowseRows } from "./browse";

function publicEpisodeSummary(episode: EpisodeBrowseRow, progress: ReturnType<typeof summarizeMovieProgress>) {
  const summary = publicMovieSummary(
    {
      id: episode.id,
      title: episode.title,
      sort_title: episode.title,
      year: null,
      poster_path: episode.poster_path,
      release_date: episode.release_date,
      popularity: episode.popularity,
      vote_average: episode.vote_average,
      file_count: Number(episode.file_count ?? 0),
      latest_file_created_at: episode.latest_file_created_at,
    },
    progress,
  );

  return {
    id: episode.id,
    title: episode.title,
    showId: episode.show_id,
    showTitle: episode.show_title,
    seasonId: episode.season_id,
    seasonTitle: episode.season_title,
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
    releaseDate: episode.release_date,
    runtimeSeconds: episode.runtime_seconds,
    stillUrl: tmdbImageUrl(episode.poster_path, "w500"),
    showPosterUrl: tmdbImageUrl(episode.show_poster_path),
    fileCount: Number(episode.file_count ?? 0),
    fileId: summary.resumeFileId ?? episode.first_file_id,
    progressSeconds: summary.progressSeconds,
    durationSeconds: summary.durationSeconds,
    completed: summary.completed,
  };
}

export async function tvEpisodeProgress(userId: string, episodeIds: string[]) {
  if (episodeIds.length === 0) return summarizeMovieProgress([]);
  const db = await getDb();
  const rows = await db
    .selectFrom("watch_progress")
    .select(["media_item_id", "media_file_id", "position_seconds", "duration_seconds", "completed", "updated_at"])
    .where("user_id", "=", userId)
    .where("media_item_id", "in", episodeIds)
    .orderBy("updated_at", "desc")
    .execute();
  return summarizeMovieProgress(rows);
}

function filteredEpisodeBrowse(db: Kysely<Database>, userId: string) {
  return db
    .selectFrom("media_item as episode")
    .innerJoin("media_item as season", "season.id", "episode.parent_id")
    .innerJoin("media_item as show", "show.id", "season.parent_id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
    .where("episode.kind", "=", "episode")
    .where("season.kind", "=", "season")
    .where("show.kind", "=", "show")
    .where(accessibleLibrarySql(userId));
}

function episodeBrowseSelect(filtered: ReturnType<typeof filteredEpisodeBrowse>) {
  return filtered
    .select([
      "episode.id",
      "episode.title",
      "episode.overview",
      "episode.season_number",
      "episode.episode_number",
      "episode.release_date",
      "episode.runtime_seconds",
      "episode.poster_path",
      "episode.popularity",
      "episode.vote_average",
      sql<string>`season.id`.as("season_id"),
      sql<string>`season.title`.as("season_title"),
      sql<string>`show.id`.as("show_id"),
      sql<string>`show.title`.as("show_title"),
      sql<string>`show.sort_title`.as("show_sort_title"),
      sql<number | null>`show.year`.as("show_year"),
      sql<string | null>`show.poster_path`.as("show_poster_path"),
      sql<string | null>`show.backdrop_path`.as("show_backdrop_path"),
      sql<number>`count(distinct media_file.id)`.as("file_count"),
      sql<string | null>`min(media_file.id)`.as("first_file_id"),
      sql<string | null>`max(media_file.created_at)`.as("latest_file_created_at"),
    ])
    .groupBy("episode.id");
}

type EpisodeBrowseQuery = ReturnType<typeof episodeBrowseSelect>;

function applyEpisodeContinueWatchingFilters(query: EpisodeBrowseQuery, userId: string, maxAgeDays: number) {
  return query
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("watch_progress as completed_progress")
            .select("completed_progress.media_item_id")
            .where("completed_progress.user_id", "=", userId)
            .whereRef("completed_progress.media_item_id", "=", "episode.id")
            .where(sql<boolean>`completed_progress.completed = 1`),
        ),
      ),
    )
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("watch_progress as incomplete_progress")
          .select("incomplete_progress.media_item_id")
          .where("incomplete_progress.user_id", "=", userId)
          .whereRef("incomplete_progress.media_item_id", "=", "episode.id")
          .where(sql<boolean>`incomplete_progress.completed = 0`)
          .where("incomplete_progress.position_seconds", ">=", MIN_CONTINUE_POSITION_SECONDS)
          .$if(continueMaxAgeEnabledForDays(maxAgeDays), (qb) =>
            qb.where("incomplete_progress.updated_at", ">", continueMaxAgeCutoffSqlForDays(maxAgeDays)),
          ),
      ),
    );
}

function orderContinueEpisodes(query: EpisodeBrowseQuery, userId: string, maxAgeDays: number) {
  return query
    .orderBy(
      sql<string | null>`(
        select max(incomplete_progress.updated_at)
        from watch_progress incomplete_progress
        where incomplete_progress.user_id = ${userId}
          and incomplete_progress.media_item_id = episode.id
          and incomplete_progress.completed = 0
          and incomplete_progress.position_seconds >= ${MIN_CONTINUE_POSITION_SECONDS}
          ${continueMaxAgeEnabledForDays(maxAgeDays) ? sql`and incomplete_progress.updated_at > ${continueMaxAgeCutoffSqlForDays(maxAgeDays)}` : sql``}
      )`,
      "desc",
    )
    .orderBy("show.sort_title", "asc")
    .orderBy("episode.season_number", "asc")
    .orderBy("episode.episode_number", "asc")
    .orderBy("episode.title", "asc");
}

function applyWithProgressShowFilter(query: EpisodeBrowseQuery, userId: string) {
  return query.where((eb) =>
    eb.exists(
      eb
        .selectFrom("watch_progress as any_progress")
        .innerJoin("media_item as progressed_episode", "progressed_episode.id", "any_progress.media_item_id")
        .innerJoin("media_item as progressed_season", "progressed_season.id", "progressed_episode.parent_id")
        .select("any_progress.media_item_id")
        .where("any_progress.user_id", "=", userId)
        .where("progressed_episode.kind", "=", "episode")
        .where("progressed_season.kind", "=", "season")
        .whereRef("progressed_season.parent_id", "=", "show.id"),
    ),
  );
}

function orderEpisodeBrowseDefault(query: EpisodeBrowseQuery) {
  return query
    .orderBy("show.sort_title", "asc")
    .orderBy("episode.season_number", "asc")
    .orderBy("episode.episode_number", "asc")
    .orderBy("episode.title", "asc");
}

async function paginatedContinueEpisodeRows(userId: string, page: number, limit: number) {
  const db = await getDb();
  const maxAgeDays = await getContinueMaxAgeDays(userId);
  const ordered = orderContinueEpisodes(
    applyEpisodeContinueWatchingFilters(episodeBrowseSelect(filteredEpisodeBrowse(db, userId)), userId, maxAgeDays),
    userId,
    maxAgeDays,
  );
  return paginatedGroupedRail(
    ordered,
    async () => {
      const totalRow = await db
        .selectFrom(ordered.as("rail_rows"))
        .select(sql<number>`count(*)`.as("total"))
        .executeTakeFirst();
      return Number(totalRow?.total ?? 0);
    },
    page,
    limit,
  );
}

async function allWithProgressEpisodeRows(userId: string) {
  const db = await getDb();
  return orderEpisodeBrowseDefault(
    applyWithProgressShowFilter(episodeBrowseSelect(filteredEpisodeBrowse(db, userId)), userId),
  ).execute();
}

async function buildNextUpEpisodeRows(userId: string) {
  const maxAgeDays = await getContinueMaxAgeDays(userId);
  const rows = await allWithProgressEpisodeRows(userId);
  if (rows.length === 0) return [] as EpisodeBrowseRow[];

  const progress = await tvEpisodeProgress(
    userId,
    rows.map((episode) => episode.id),
  );
  const completedEpisodes = progress.completedMovies;
  const inProgressEpisodes = new Set(
    rows
      .filter((episode) => {
        const latest = progress.latestIncompleteProgress.get(episode.id);
        return latest && Number(latest.position_seconds ?? 0) >= MIN_CONTINUE_POSITION_SECONDS;
      })
      .map((episode) => episode.id),
  );
  const activeShowIds = continueMaxAgeEnabledForDays(maxAgeDays)
    ? new Set(
        rows
          .filter((episode) => {
            const latest = progress.latestProgress.get(episode.id);
            return latest?.updated_at ? isContinueProgressFresh(latest.updated_at, { maxAgeDays }) : false;
          })
          .map((episode) => episode.show_id),
      )
    : null;
  const byShow = new Map<string, EpisodeBrowseRow[]>();
  for (const row of rows) {
    if (activeShowIds && !activeShowIds.has(row.show_id)) continue;
    const showRows = byShow.get(row.show_id) ?? [];
    showRows.push(row);
    byShow.set(row.show_id, showRows);
  }

  const nextRows: EpisodeBrowseRow[] = [];
  for (const showEpisodes of byShow.values()) {
    const latestCompletedIndex = showEpisodes.reduce(
      (latest, episode, index) => (completedEpisodes.has(episode.id) ? index : latest),
      -1,
    );
    if (latestCompletedIndex === -1) continue;
    const next = showEpisodes
      .slice(latestCompletedIndex + 1)
      .find((episode) => !completedEpisodes.has(episode.id) && !inProgressEpisodes.has(episode.id));
    if (next) nextRows.push(next);
  }

  return nextRows;
}

async function paginatedNextUpEpisodeRows(userId: string, page: number, limit: number) {
  const allNextRows = await buildNextUpEpisodeRows(userId);
  const { items, page: pageInfo } = paginatedSlice(page, limit, allNextRows);
  return { items, page: pageInfo };
}

async function mapEpisodeSummaries(userId: string, episodes: EpisodeBrowseRow[]) {
  const progress = await tvEpisodeProgress(
    userId,
    episodes.map((episode) => episode.id),
  );
  return episodes.map((episode) => publicEpisodeSummary(episode, progress));
}

export async function tvRows(
  userId: string,
  search?: string,
  sort?: ShowSort,
  pageInput?: number,
  pageSize?: number,
  rails?: null,
): Promise<ShowRowsResponse>;
export async function tvRows(
  userId: string,
  search: string,
  sort: ShowSort,
  pageInput: number,
  pageSize: number,
  rails: readonly ShowBrowseRail[],
): Promise<Partial<ShowRowsResponse>>;
export async function tvRows(
  userId: string,
  search = "",
  sort: ShowSort = "title",
  pageInput = 1,
  pageSize = SHOW_PAGE_SIZE,
  rails: readonly ShowBrowseRail[] | null = null,
): Promise<ShowRowsResponse | Partial<ShowRowsResponse>> {
  const page = normalizePage(pageInput);
  const limit = catalogPageSize(pageSize);

  const fetchRail = async (rail: ShowBrowseRail): Promise<Partial<ShowRowsResponse>> => {
    if (rail === "continueWatching") {
      const { items, page: railPage } = await paginatedContinueEpisodeRows(userId, page, limit);
      return {
        continueWatching: await mapEpisodeSummaries(userId, items),
        continueWatchingPage: railPage,
      };
    }

    if (rail === "nextUp") {
      const { items, page: railPage } = await paginatedNextUpEpisodeRows(userId, page, limit);
      return {
        nextUp: await mapEpisodeSummaries(userId, items),
        nextUpPage: railPage,
      };
    }

    return showBrowseRows(userId, search, sort, pageInput, pageSize, [rail]);
  };

  if (rails && rails.length > 0) {
    const parts = await Promise.all(rails.map((rail) => fetchRail(rail)));
    return Object.assign({}, ...parts);
  }

  const [browse, continueRail, nextUpRail] = await Promise.all([
    showBrowseRows(userId, search, sort, pageInput, pageSize),
    paginatedContinueEpisodeRows(userId, page, limit),
    paginatedNextUpEpisodeRows(userId, page, limit),
  ]);
  const episodeIds = [...new Set([...continueRail.items, ...nextUpRail.items].map((episode) => episode.id))];
  const progress = await tvEpisodeProgress(userId, episodeIds);
  const mapEpisode = (episode: EpisodeBrowseRow) => publicEpisodeSummary(episode, progress);

  return {
    continueWatching: continueRail.items.map(mapEpisode),
    continueWatchingPage: continueRail.page,
    nextUp: nextUpRail.items.map(mapEpisode),
    nextUpPage: nextUpRail.page,
    all: browse.all,
    allPage: browse.allPage,
    recent: browse.recent,
    recentPage: browse.recentPage,
    latest: browse.latest,
    latestPage: browse.latestPage,
    popular: browse.popular,
    popularPage: browse.popularPage,
  } satisfies ShowRowsResponse;
}

export async function continueEpisodeRows(
  userId: string,
  pageInput = 1,
  pageSize = BROWSE_RAIL_LIMIT,
): Promise<Pick<ShowRowsResponse, "continueWatching" | "continueWatchingPage">> {
  const page = normalizePage(pageInput);
  const limit = catalogPageSize(pageSize);
  const continueRail = await paginatedContinueEpisodeRows(userId, page, limit);

  return {
    continueWatching: await mapEpisodeSummaries(userId, continueRail.items),
    continueWatchingPage: continueRail.page,
  };
}

export async function nextUpEpisodeRows(
  userId: string,
  pageInput = 1,
  pageSize = BROWSE_RAIL_LIMIT,
): Promise<Pick<ShowRowsResponse, "nextUp" | "nextUpPage">> {
  const page = normalizePage(pageInput);
  const limit = catalogPageSize(pageSize);
  const nextUpRail = await paginatedNextUpEpisodeRows(userId, page, limit);

  return {
    nextUp: await mapEpisodeSummaries(userId, nextUpRail.items),
    nextUpPage: nextUpRail.page,
  };
}

export async function continueTvRows(
  userId: string,
  pageInput = 1,
  pageSize = BROWSE_RAIL_LIMIT,
): Promise<Pick<ShowRowsResponse, "continueWatching" | "continueWatchingPage" | "nextUp" | "nextUpPage">> {
  const [continueResults, nextUpResults] = await Promise.all([
    continueEpisodeRows(userId, pageInput, pageSize),
    nextUpEpisodeRows(userId, pageInput, pageSize),
  ]);

  return {
    continueWatching: continueResults.continueWatching,
    continueWatchingPage: continueResults.continueWatchingPage,
    nextUp: nextUpResults.nextUp,
    nextUpPage: nextUpResults.nextUpPage,
  };
}
