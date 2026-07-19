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
  type ShowSort,
  type ShowBrowseRail,
} from "../catalog";
import { publicMovieSummary, summarizeMovieProgress } from "../progress";
import {
  continueMaxAgeCutoffSqlForDays,
  getContinueMaxAgeDays,
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

function continueEpisodeQuery(db: Kysely<Database>, userId: string, maxAgeDays: number) {
  return db
    .with("continue_progress", (creator) => {
      let query = creator
        .selectFrom("watch_progress")
        .select([
          "watch_progress.media_item_id",
          sql<string | null>`max(watch_progress.updated_at)`.as("latest_continue_updated_at"),
        ])
        .where("watch_progress.user_id", "=", userId)
        .where(sql<boolean>`watch_progress.completed = 0`)
        .where("watch_progress.position_seconds", ">=", MIN_CONTINUE_POSITION_SECONDS)
        .groupBy("watch_progress.media_item_id");

      if (maxAgeDays > 0) {
        query = query.where("watch_progress.updated_at", ">", continueMaxAgeCutoffSqlForDays(maxAgeDays));
      }

      return query;
    })
    .selectFrom("continue_progress")
    .innerJoin("media_item as episode", "episode.id", "continue_progress.media_item_id")
    .innerJoin("media_item as season", "season.id", "episode.parent_id")
    .innerJoin("media_item as show", "show.id", "season.parent_id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
    .leftJoin("watch_progress as completed_progress", (join) =>
      join
        .onRef("completed_progress.media_item_id", "=", "episode.id")
        .on("completed_progress.user_id", "=", userId)
        .on(sql<boolean>`completed_progress.completed = 1`),
    )
    .where("completed_progress.media_item_id", "is", null)
    .where(accessibleLibrarySql(userId))
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
    .groupBy("episode.id")
    .orderBy("continue_progress.latest_continue_updated_at", "desc")
    .orderBy("show.sort_title", "asc")
    .orderBy("episode.season_number", "asc")
    .orderBy("episode.episode_number", "asc")
    .orderBy("episode.title", "asc")
    .$castTo<EpisodeBrowseRow>();
}

async function paginatedContinueEpisodeRows(userId: string, page: number, limit: number, maxAgeDays: number) {
  const db = await getDb();
  const ordered = continueEpisodeQuery(db, userId, maxAgeDays);
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

function nextUpEpisodeQuery(db: Kysely<Database>, userId: string) {
  return db
    .with("latest_completed", (creator) =>
      creator
        .selectFrom("watch_progress")
        .innerJoin("media_item as episode", "episode.id", "watch_progress.media_item_id")
        .innerJoin("media_item as season", "season.id", "episode.parent_id")
        .innerJoin("media_item as show", "show.id", "season.parent_id")
        .select([
          sql<string>`show.id`.as("show_id"),
          "episode.season_number",
          "episode.episode_number",
          sql<number>`row_number() over (partition by show.id order by episode.season_number desc, episode.episode_number desc)`.as(
            "rn",
          ),
        ])
        .where("watch_progress.user_id", "=", userId)
        .where(sql<boolean>`watch_progress.completed = 1`),
    )
    .with("candidate_next", (creator) =>
      creator
        .selectFrom("latest_completed")
        .innerJoin("media_item as show", "show.id", "latest_completed.show_id")
        .innerJoin("media_item as season", "season.parent_id", "show.id")
        .innerJoin("media_item as episode", "episode.parent_id", "season.id")
        .innerJoin("media_file", "media_file.media_item_id", "episode.id")
        .leftJoin("watch_progress as completed_progress", (join) =>
          join
            .onRef("completed_progress.media_item_id", "=", "episode.id")
            .on("completed_progress.user_id", "=", userId)
            .on(sql<boolean>`completed_progress.completed = 1`),
        )
        .leftJoin("watch_progress as in_progress", (join) =>
          join
            .onRef("in_progress.media_item_id", "=", "episode.id")
            .on("in_progress.user_id", "=", userId)
            .on(sql<boolean>`in_progress.completed = 0`)
            .on("in_progress.position_seconds", ">=", MIN_CONTINUE_POSITION_SECONDS),
        )
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
          sql<number>`row_number() over (partition by show.id order by episode.season_number asc, episode.episode_number asc)`.as(
            "rn",
          ),
        ])
        .where("latest_completed.rn", "=", 1)
        .where(accessibleLibrarySql(userId))
        .where(
          sql<boolean>`(
          episode.season_number > latest_completed.season_number
          or (
            episode.season_number = latest_completed.season_number
            and episode.episode_number > latest_completed.episode_number
          )
        )`,
        )
        .where("completed_progress.media_item_id", "is", null)
        .where("in_progress.media_item_id", "is", null)
        .groupBy("episode.id"),
    )
    .selectFrom("candidate_next")
    .select([
      "candidate_next.id",
      "candidate_next.title",
      "candidate_next.overview",
      "candidate_next.season_number",
      "candidate_next.episode_number",
      "candidate_next.release_date",
      "candidate_next.runtime_seconds",
      "candidate_next.poster_path",
      "candidate_next.popularity",
      "candidate_next.vote_average",
      "candidate_next.season_id",
      "candidate_next.season_title",
      "candidate_next.show_id",
      "candidate_next.show_title",
      "candidate_next.show_sort_title",
      "candidate_next.show_year",
      "candidate_next.show_poster_path",
      "candidate_next.show_backdrop_path",
      "candidate_next.file_count",
      "candidate_next.first_file_id",
      "candidate_next.latest_file_created_at",
    ])
    .where("candidate_next.rn", "=", 1)
    .orderBy("candidate_next.show_sort_title", "asc")
    .orderBy("candidate_next.season_number", "asc")
    .orderBy("candidate_next.episode_number", "asc")
    .orderBy("candidate_next.title", "asc")
    .$castTo<EpisodeBrowseRow>();
}

async function paginatedNextUpEpisodeRows(userId: string, page: number, limit: number) {
  const db = await getDb();
  const ordered = nextUpEpisodeQuery(db, userId);
  return paginatedGroupedRail(
    ordered,
    async () => {
      const totalRow = await db
        .selectFrom(ordered.as("next_up_rows"))
        .select(sql<number>`count(*)`.as("total"))
        .executeTakeFirst();
      return Number(totalRow?.total ?? 0);
    },
    page,
    limit,
  );
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
  const needsContinueMaxAge = !rails || rails.length === 0 || rails.some((rail) => rail === "continueWatching");
  const maxAgeDays = needsContinueMaxAge ? await getContinueMaxAgeDays(userId) : 0;

  const fetchRail = async (rail: ShowBrowseRail): Promise<Partial<ShowRowsResponse>> => {
    if (rail === "continueWatching") {
      const { items, page: railPage } = await paginatedContinueEpisodeRows(userId, page, limit, maxAgeDays);
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
    paginatedContinueEpisodeRows(userId, page, limit, maxAgeDays),
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
  maxAgeDaysInput?: number,
): Promise<Pick<ShowRowsResponse, "continueWatching" | "continueWatchingPage">> {
  const page = normalizePage(pageInput);
  const limit = catalogPageSize(pageSize);
  const maxAgeDays = maxAgeDaysInput ?? (await getContinueMaxAgeDays(userId));
  const continueRail = await paginatedContinueEpisodeRows(userId, page, limit, maxAgeDays);

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
  const maxAgeDays = await getContinueMaxAgeDays(userId);
  const [continueResults, nextUpResults] = await Promise.all([
    continueEpisodeRows(userId, pageInput, pageSize, maxAgeDays),
    nextUpEpisodeRows(userId, pageInput, pageSize),
  ]);

  return {
    continueWatching: continueResults.continueWatching,
    continueWatchingPage: continueResults.continueWatchingPage,
    nextUp: nextUpResults.nextUp,
    nextUpPage: nextUpResults.nextUpPage,
  };
}
