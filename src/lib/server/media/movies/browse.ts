import type { MovieBrowseRailResponse, MovieRowsResponse } from "$lib/media/types";
import { sql } from "kysely";
import { getDb } from "../../db";
import {
  BROWSE_RAIL_LIMIT,
  MOVIE_PAGE_SIZE,
  accessibleLibrarySql,
  browseMatchesSearchSql,
  catalogPageInfo,
  catalogPageSize,
  emptyCatalogPage,
  normalizePage,
  paginatedGroupedRail,
  type MovieSort,
  type MovieStatusFilter,
  type MovieBrowseRail,
} from "../catalog";
import { publicMovieSummary, summarizeMovieProgress } from "../progress";
import {
  continueMaxAgeCutoffSqlForDays,
  continueMaxAgeEnabledForDays,
  getContinueMaxAgeDays,
  MIN_CONTINUE_POSITION_SECONDS,
} from "../continue-max-age";
import type { MovieBrowseRow } from "../types";
import { publicMovieListItem } from "./shared";

const MOVIE_BROWSE_SEARCH_LIKE_EXPRESSIONS = [
  "media_item.title",
  "coalesce(media_item.original_title, '')",
  "media_item.sort_title",
  "media_file.basename",
] as const;

function mapBrowsableMovie(movie: MovieBrowseRow, progress: ReturnType<typeof summarizeMovieProgress>) {
  return publicMovieListItem(publicMovieSummary(movie, progress));
}

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
  const needsContinueMaxAge = !rails || rails.length === 0 || rails.includes("continueWatching");
  const maxAgeDays = needsContinueMaxAge ? await getContinueMaxAgeDays(userId) : 0;
  const searchPattern = search.trim();
  const page = normalizePage(pageInput);
  const limit = catalogPageSize(pageSize);

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
            .$if(continueMaxAgeEnabledForDays(maxAgeDays), (qb) =>
              qb.where("watch_progress.updated_at", ">", continueMaxAgeCutoffSqlForDays(maxAgeDays)),
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
            ${continueMaxAgeEnabledForDays(maxAgeDays) ? sql`and watch_progress.updated_at > ${continueMaxAgeCutoffSqlForDays(maxAgeDays)}` : sql``}
        )`,
        "desc",
      ),
    );

  const countGroupedRail = async (orderedQuery: ReturnType<typeof movieSelect>) => {
    const row = await db
      .selectFrom(orderedQuery.as("rail_rows"))
      .select(sql<number>`count(*)`.as("total"))
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  };

  const loadMovieBrowseProgress = async (movieIds: string[]) => {
    if (movieIds.length === 0) return summarizeMovieProgress([]);

    const progressRows = await db
      .selectFrom("watch_progress")
      .select(["media_item_id", "media_file_id", "position_seconds", "duration_seconds", "completed", "updated_at"])
      .where("user_id", "=", userId)
      .where("media_item_id", "in", movieIds)
      .orderBy("updated_at", "desc")
      .execute();

    return summarizeMovieProgress(progressRows);
  };

  const mapPublicMovies = async (rows: MovieBrowseRow[]) => {
    const progress = await loadMovieBrowseProgress([...new Set(rows.map((movie) => movie.id))]);
    return rows.map((movie) => mapBrowsableMovie(movie, progress));
  };

  const fetchContinueRail = async () => {
    const ordered = continueOrder();
    return paginatedGroupedRail(ordered, () => countGroupedRail(ordered), page, limit);
  };

  const fetchRecentRail = async () => {
    const ordered = recentOrder(movieSelect());
    return paginatedGroupedRail(ordered, () => countGroupedRail(ordered), page, limit);
  };

  const fetchLatestRail = async () => {
    const ordered = latestOrder(movieSelect());
    return paginatedGroupedRail(ordered, () => countGroupedRail(ordered), page, limit);
  };

  const fetchPopularRail = async () => {
    const ordered = popularOrder(movieSelect());
    return paginatedGroupedRail(ordered, () => countGroupedRail(ordered), page, limit);
  };

  const fetchAllRail = async () => {
    const totalRow = await filteredMovies()
      .select(sql<number>`count(distinct media_item.id)`.as("total"))
      .executeTakeFirst();
    const total = Number(totalRow?.total ?? 0);
    const pageInfo = catalogPageInfo(page, limit, total);
    const offset = (pageInfo.page - 1) * pageInfo.pageSize;
    const allRows =
      total === 0 ? [] : await withBrowseOrder(movieSelect()).limit(pageInfo.pageSize).offset(offset).execute();
    return { items: allRows, page: pageInfo };
  };

  const fetchRail = async (rail: MovieBrowseRail): Promise<MovieBrowseRailResponse> => {
    if (rail === "continueWatching") {
      const { items, page: railPage } = await fetchContinueRail();
      return { continueWatching: await mapPublicMovies(items), continueWatchingPage: railPage };
    }

    if (rail === "recent") {
      const { items, page: railPage } = await fetchRecentRail();
      return { recent: await mapPublicMovies(items), recentPage: railPage };
    }

    if (rail === "latest") {
      const { items, page: railPage } = await fetchLatestRail();
      return { latest: await mapPublicMovies(items), latestPage: railPage };
    }

    if (rail === "popular") {
      const { items, page: railPage } = await fetchPopularRail();
      return { popular: await mapPublicMovies(items), popularPage: railPage };
    }

    const { items, page: railPage } = await fetchAllRail();
    return { all: await mapPublicMovies(items), allPage: railPage };
  };

  if (rails && rails.length > 0) {
    const parts = await Promise.all(rails.map((rail) => fetchRail(rail)));
    return Object.assign({}, ...parts);
  }

  const [continueRail, allRail, recentRail, latestRail, popularRail] = await Promise.all([
    fetchContinueRail(),
    fetchAllRail(),
    fetchRecentRail(),
    fetchLatestRail(),
    fetchPopularRail(),
  ]);
  const movieIds = [
    ...new Set(
      [...continueRail.items, ...allRail.items, ...recentRail.items, ...latestRail.items, ...popularRail.items].map(
        (movie) => movie.id,
      ),
    ),
  ];
  const progress = await loadMovieBrowseProgress(movieIds);

  return {
    continueWatching: continueRail.items.map((movie) => mapBrowsableMovie(movie, progress)),
    continueWatchingPage: continueRail.page,
    all: allRail.items.map((movie) => mapBrowsableMovie(movie, progress)),
    allPage: allRail.page,
    recent: recentRail.items.map((movie) => mapBrowsableMovie(movie, progress)),
    recentPage: recentRail.page,
    latest: latestRail.items.map((movie) => mapBrowsableMovie(movie, progress)),
    latestPage: latestRail.page,
    popular: popularRail.items.map((movie) => mapBrowsableMovie(movie, progress)),
    popularPage: popularRail.page,
  } satisfies MovieRowsResponse;
}

export async function continueMovieRows(
  userId: string,
  pageInput = 1,
  pageSize = BROWSE_RAIL_LIMIT,
): Promise<Pick<MovieRowsResponse, "continueWatching" | "continueWatchingPage">> {
  const result = await movieRows(userId, "", "all", "title", pageInput, pageSize, ["continueWatching"]);
  return {
    continueWatching: result.continueWatching ?? [],
    continueWatchingPage: result.continueWatchingPage ?? emptyCatalogPage(pageInput, pageSize),
  };
}
