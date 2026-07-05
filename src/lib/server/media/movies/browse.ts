import type { MovieBrowseRailResponse, MovieRowsResponse } from "$lib/media/types";
import { sql } from "kysely";
import { getDb } from "../../db";
import {
  MOVIE_PAGE_SIZE,
  accessibleLibrarySql,
  browseMatchesSearchSql,
  normalizePage,
  type MovieSort,
  type MovieStatusFilter,
  type MovieBrowseRail,
} from "../catalog";
import { publicMovieSummary, summarizeMovieProgress } from "../progress";
import { continueMaxAgeCutoffSql, continueMaxAgeEnabled, MIN_CONTINUE_POSITION_SECONDS } from "../continue-max-age";
import type { MovieBrowseRow } from "../types";
import { publicMovieListItem } from "./shared";

const MOVIE_BROWSE_SEARCH_LIKE_EXPRESSIONS = [
  "media_item.title",
  "coalesce(media_item.original_title, '')",
  "media_item.sort_title",
  "media_file.basename",
] as const;

export async function movieRows(
  userId: string,
  search?: string,
  status?: MovieStatusFilter,
  sort?: MovieSort,
  pageInput?: number,
  pageSize?: number,
  rails?: null,
): Promise<MovieRowsResponse>;
export async function movieRows(
  userId: string,
  search: string,
  status: MovieStatusFilter,
  sort: MovieSort,
  pageInput: number,
  pageSize: number,
  rails: readonly MovieBrowseRail[],
): Promise<MovieBrowseRailResponse>;
export async function movieRows(
  userId: string,
  search = "",
  status: MovieStatusFilter = "all",
  sort: MovieSort = "title",
  pageInput = 1,
  pageSize = MOVIE_PAGE_SIZE,
  rails: readonly MovieBrowseRail[] | null = null,
): Promise<MovieRowsResponse | MovieBrowseRailResponse> {
  const db = await getDb();
  const searchPattern = search.trim();
  const page = normalizePage(pageInput);
  const cleanPageSize = Math.max(1, Math.min(Math.floor(pageSize), 200));

  const filteredMovies = () =>
    db
      .selectFrom("media_item")
      .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
      .where("media_item.kind", "=", "movie")
      .where(accessibleLibrarySql(userId))
      .$if(searchPattern.length > 0, (qb) =>
        qb.where(browseMatchesSearchSql(searchPattern, "media_item.id", MOVIE_BROWSE_SEARCH_LIKE_EXPRESSIONS)),
      )
      .$if(status === "watched", (qb) =>
        qb.where((eb) =>
          eb.exists(
            eb
              .selectFrom("watch_progress")
              .select("watch_progress.media_item_id")
              .where("watch_progress.user_id", "=", userId)
              .whereRef("watch_progress.media_item_id", "=", "media_item.id")
              .where(sql<boolean>`watch_progress.completed = 1`),
          ),
        ),
      )
      .$if(status === "unwatched", (qb) =>
        qb.where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("watch_progress")
                .select("watch_progress.media_item_id")
                .where("watch_progress.user_id", "=", userId)
                .whereRef("watch_progress.media_item_id", "=", "media_item.id")
                .where(sql<boolean>`watch_progress.completed = 1`),
            ),
          ),
        ),
      );

  const movieSelect = () =>
    filteredMovies()
      .select([
        "media_item.id",
        "media_item.title",
        "media_item.sort_title",
        "media_item.year",
        "media_item.poster_path",
        "media_item.release_date",
        "media_item.popularity",
        "media_item.vote_average",
        sql<number>`count(distinct media_file.id)`.as("file_count"),
        sql<string | null>`max(media_file.created_at)`.as("latest_file_created_at"),
      ])
      .groupBy("media_item.id");

  const withTitleOrder = <T>(query: T) =>
    (query as ReturnType<typeof movieSelect>)
      .orderBy("media_item.sort_title", "asc")
      .orderBy("media_item.title", "asc");
  const withBrowseOrder = (query: ReturnType<typeof movieSelect>) => {
    if (sort === "year_desc") {
      return withTitleOrder(query.orderBy("media_item.year", "desc"));
    }
    if (sort === "recent") {
      return withTitleOrder(query.orderBy(sql<string | null>`max(media_file.created_at)`, "desc"));
    }
    if (sort === "rating") {
      return withTitleOrder(query.orderBy("media_item.popularity", "desc").orderBy("media_item.vote_average", "desc"));
    }
    if (sort === "release_date") {
      return withTitleOrder(query.orderBy("media_item.release_date", "desc"));
    }
    return withTitleOrder(query);
  };
  const recentOrder = (query: ReturnType<typeof movieSelect>) =>
    withTitleOrder(query.orderBy(sql<string | null>`max(media_file.created_at)`, "desc"));
  const latestOrder = (query: ReturnType<typeof movieSelect>) =>
    withTitleOrder(query.orderBy("media_item.release_date", "desc"));
  const popularOrder = (query: ReturnType<typeof movieSelect>) =>
    withTitleOrder(query.orderBy("media_item.popularity", "desc").orderBy("media_item.vote_average", "desc"));

  const applyMovieContinueWatchingFilters = (query: ReturnType<typeof movieSelect>) =>
    query
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom("watch_progress")
              .select("watch_progress.media_item_id")
              .where("watch_progress.user_id", "=", userId)
              .whereRef("watch_progress.media_item_id", "=", "media_item.id")
              .where(sql<boolean>`watch_progress.completed = 1`),
          ),
        ),
      )
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom("watch_progress")
            .select("watch_progress.media_item_id")
            .where("watch_progress.user_id", "=", userId)
            .whereRef("watch_progress.media_item_id", "=", "media_item.id")
            .where(sql<boolean>`watch_progress.completed = 0`)
            .where("watch_progress.position_seconds", ">=", MIN_CONTINUE_POSITION_SECONDS)
            .$if(continueMaxAgeEnabled(), (qb) =>
              qb.where("watch_progress.updated_at", ">", continueMaxAgeCutoffSql()),
            ),
        ),
      );

  const continueOrder = () =>
    withTitleOrder(
      applyMovieContinueWatchingFilters(movieSelect()).orderBy(
        sql<string | null>`(
          select max(watch_progress.updated_at)
          from watch_progress
          where watch_progress.user_id = ${userId}
            and watch_progress.media_item_id = media_item.id
            and watch_progress.completed = 0
            and watch_progress.position_seconds >= ${MIN_CONTINUE_POSITION_SECONDS}
            ${continueMaxAgeEnabled() ? sql`and watch_progress.updated_at > ${continueMaxAgeCutoffSql()}` : sql``}
        )`,
        "desc",
      ),
    );

  const mapPublicMovies = async (rows: MovieBrowseRow[]) => {
    const movieIds = [...new Set(rows.map((movie) => movie.id))];
    const progressRows =
      movieIds.length === 0
        ? []
        : await db
            .selectFrom("watch_progress")
            .select([
              "media_item_id",
              "media_file_id",
              "position_seconds",
              "duration_seconds",
              "completed",
              "updated_at",
            ])
            .where("user_id", "=", userId)
            .where("media_item_id", "in", movieIds)
            .orderBy("updated_at", "desc")
            .execute();
    const progress = summarizeMovieProgress(progressRows);
    const mapMovie = (movie: MovieBrowseRow) => {
      const summary = publicMovieSummary(movie, progress);
      return {
        ...summary,
        sortTitle: movie.sort_title,
        latestFileCreatedAt: movie.latest_file_created_at,
      };
    };
    return rows.map(mapMovie).map(publicMovieListItem);
  };

  const fetchRail = async (rail: MovieBrowseRail): Promise<MovieBrowseRailResponse> => {
    if (rail === "continueWatching") {
      const continueRows = await continueOrder().limit(24).execute();
      return { continueWatching: await mapPublicMovies(continueRows) };
    }

    if (rail === "recent") {
      const recentRows = await recentOrder(movieSelect()).limit(24).execute();
      return { recent: await mapPublicMovies(recentRows) };
    }

    if (rail === "latest") {
      const latestRows = await latestOrder(movieSelect()).limit(24).execute();
      return { latest: await mapPublicMovies(latestRows) };
    }

    if (rail === "popular") {
      const popularRows = await popularOrder(movieSelect()).limit(24).execute();
      return { popular: await mapPublicMovies(popularRows) };
    }

    const totalRow = await filteredMovies()
      .select(sql<number>`count(distinct media_item.id)`.as("total"))
      .executeTakeFirst();
    const total = Number(totalRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / cleanPageSize));
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * cleanPageSize;
    const allRows = await withBrowseOrder(movieSelect()).limit(cleanPageSize).offset(offset).execute();
    return {
      all: await mapPublicMovies(allRows),
      allPage: {
        page: currentPage,
        pageSize: cleanPageSize,
        total,
        totalPages,
        hasPrevious: currentPage > 1,
        hasNext: currentPage < totalPages,
      },
    };
  };

  if (rails && rails.length > 0) {
    const parts = await Promise.all(rails.map((rail) => fetchRail(rail)));
    return Object.assign({}, ...parts);
  }

  const totalRow = await filteredMovies()
    .select(sql<number>`count(distinct media_item.id)`.as("total"))
    .executeTakeFirst();
  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / cleanPageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * cleanPageSize;

  const allRows = await withBrowseOrder(movieSelect()).limit(cleanPageSize).offset(offset).execute();
  const continueRows = await continueOrder().limit(24).execute();
  const recentRows = await recentOrder(movieSelect()).limit(24).execute();
  const latestRows = await latestOrder(movieSelect()).limit(24).execute();
  const popularRows = await popularOrder(movieSelect()).limit(24).execute();
  const movieIds = [
    ...new Set([...allRows, ...continueRows, ...recentRows, ...latestRows, ...popularRows].map((movie) => movie.id)),
  ];
  const progressRows =
    movieIds.length === 0
      ? []
      : await db
          .selectFrom("watch_progress")
          .select(["media_item_id", "media_file_id", "position_seconds", "duration_seconds", "completed", "updated_at"])
          .where("user_id", "=", userId)
          .where("media_item_id", "in", movieIds)
          .orderBy("updated_at", "desc")
          .execute();

  const progress = summarizeMovieProgress(progressRows);

  const mapMovie = (movie: MovieBrowseRow) => {
    const summary = publicMovieSummary(movie, progress);
    return {
      ...summary,
      sortTitle: movie.sort_title,
      latestFileCreatedAt: movie.latest_file_created_at,
    };
  };

  const publicMovie = (movie: ReturnType<typeof mapMovie>) => publicMovieListItem(movie);

  return {
    continueWatching: continueRows.map(mapMovie).map(publicMovie),
    all: allRows.map(mapMovie).map(publicMovie),
    allPage: {
      page: currentPage,
      pageSize: cleanPageSize,
      total,
      totalPages,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages,
    },
    recent: recentRows.map(mapMovie).map(publicMovie),
    latest: latestRows.map(mapMovie).map(publicMovie),
    popular: popularRows.map(mapMovie).map(publicMovie),
  } satisfies MovieRowsResponse;
}
