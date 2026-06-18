import { sql } from "kysely";
import { getDb } from "../db";
import { tmdbImageUrl } from "$lib/media/images";
import {
  MOVIE_PAGE_SIZE,
  accessibleLibrarySql,
  catalogPageInfo,
  emptyCatalogPage,
  normalizePage,
  searchLikePattern,
  type MovieSort,
  type MovieStatusFilter,
} from "./catalog";
import { publicMovieSummary, summarizeMovieProgress } from "./progress";
import {
  MOVIE_SIMILARITY_CREW,
  RECOMMENDATION_SEED_LIMIT,
  aggregateWeightedSimilarityScores,
  buildSimilarityScoreSubquery,
  fetchSimilaritySeeds,
  rankIdsByScore,
} from "./similarity";
import type { MovieBrowseRow } from "./types";

function movieMatchesSearchSql(searchPattern: string) {
  const pattern = searchLikePattern(searchPattern);
  return sql<boolean>`(
    media_item.title like ${pattern} escape '\\'
    or coalesce(media_item.original_title, '') like ${pattern} escape '\\'
    or media_item.sort_title like ${pattern} escape '\\'
    or media_file.basename like ${pattern} escape '\\'
    or exists (
      select 1
      from media_item_keyword
      where media_item_keyword.media_item_id = media_item.id
        and media_item_keyword.name like ${pattern} escape '\\'
    )
    or exists (
      select 1
      from media_item_genre
      where media_item_genre.media_item_id = media_item.id
        and media_item_genre.name like ${pattern} escape '\\'
    )
  )`;
}

async function filterAccessibleMovieIds(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .select("media_item.id")
    .where("media_item.kind", "=", "movie")
    .where("media_item.id", "in", ids)
    .where(accessibleLibrarySql(userId))
    .groupBy("media_item.id")
    .execute();
  const accessible = new Set(rows.map((row) => row.id));
  return ids.filter((id) => accessible.has(id));
}

async function rankedBecauseYouWatchedMovieIds(userId: string) {
  const db = await getDb();
  const seedIds = await fetchRecentMovieSeeds(userId);
  if (seedIds.length === 0) return [];

  const completedIds = await completedMovieIdsForUser(userId);
  const excludeIds = new Set([...seedIds, ...completedIds]);
  const scores = await aggregateWeightedSimilarityScores(db, seedIds, MOVIE_SIMILARITY_CREW);
  const ranked = rankIdsByScore(scores, excludeIds);
  return filterAccessibleMovieIds(userId, ranked);
}

async function fetchRecentMovieSeeds(userId: string, limit = RECOMMENDATION_SEED_LIMIT) {
  const db = await getDb();
  const rows = await db
    .selectFrom("watch_progress")
    .innerJoin("media_item", "media_item.id", "watch_progress.media_item_id")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .where("watch_progress.user_id", "=", userId)
    .where("media_item.kind", "=", "movie")
    .where(sql<boolean>`(watch_progress.position_seconds > 0 or watch_progress.completed = 1)`)
    .where(accessibleLibrarySql(userId))
    .select("media_item.id")
    .groupBy("media_item.id")
    .orderBy(sql<string>`max(watch_progress.updated_at)`, "desc")
    .limit(limit)
    .execute();
  return rows.map((row) => row.id);
}

async function completedMovieIdsForUser(userId: string) {
  const db = await getDb();
  const rows = await db
    .selectFrom("watch_progress")
    .innerJoin("media_item", "media_item.id", "watch_progress.media_item_id")
    .select("media_item.id")
    .where("watch_progress.user_id", "=", userId)
    .where("media_item.kind", "=", "movie")
    .where(sql<boolean>`watch_progress.completed = 1`)
    .execute();
  return new Set(rows.map((row) => row.id));
}

function movieBrowseSelect(db: Awaited<ReturnType<typeof getDb>>) {
  return db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .where("media_item.kind", "=", "movie")
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
}

async function movieBrowseRowsForIds(userId: string, ids: string[]) {
  if (ids.length === 0) return [] as MovieBrowseRow[];
  const db = await getDb();
  const rows = await movieBrowseSelect(db)
    .where("media_item.id", "in", ids)
    .where(accessibleLibrarySql(userId))
    .execute();
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}

function publicMovieListItem(summary: ReturnType<typeof publicMovieSummary>) {
  return {
    id: summary.id,
    title: summary.title,
    year: summary.year,
    posterUrl: summary.posterUrl,
    releaseDate: summary.releaseDate,
    popularity: summary.popularity,
    voteAverage: summary.voteAverage,
    fileCount: summary.fileCount,
    resumeFileId: summary.resumeFileId,
    progressSeconds: summary.progressSeconds,
    durationSeconds: summary.durationSeconds,
    completed: summary.completed,
  };
}

async function publicMoviesFromBrowseRows(userId: string, browseRows: MovieBrowseRow[]) {
  const db = await getDb();
  const movieIds = browseRows.map((movie) => movie.id);
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
  return browseRows.map((movie) => publicMovieListItem(publicMovieSummary(movie, progress)));
}

export async function listBecauseYouWatchedMovies(userId: string, pageInput = 1, pageSize = MOVIE_PAGE_SIZE) {
  const rankedIds = await rankedBecauseYouWatchedMovieIds(userId);
  const page = catalogPageInfo(pageInput, pageSize, rankedIds.length);
  const offset = (page.page - 1) * page.pageSize;
  const browseRows = await movieBrowseRowsForIds(userId, rankedIds.slice(offset, offset + page.pageSize));
  return {
    movies: await publicMoviesFromBrowseRows(userId, browseRows),
    page,
  };
}

export async function movieRows(
  userId: string,
  search = "",
  status: MovieStatusFilter = "all",
  sort: MovieSort = "title",
  pageInput = 1,
  pageSize = MOVIE_PAGE_SIZE,
) {
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
      .$if(searchPattern.length > 0, (qb) => qb.where(movieMatchesSearchSql(searchPattern)))
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
  const continueOrder = () =>
    withTitleOrder(
      movieSelect()
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
              .where("watch_progress.position_seconds", ">", 0),
          ),
        )
        .orderBy(
          sql<string | null>`(
            select max(watch_progress.updated_at)
            from watch_progress
            where watch_progress.user_id = ${userId}
              and watch_progress.media_item_id = media_item.id
              and watch_progress.completed = 0
              and watch_progress.position_seconds > 0
          )`,
          "desc",
        ),
    );

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
  };
}

export async function getMovieDetail(id: string, userId: string) {
  const db = await getDb();
  const movieRow = await db
    .selectFrom("media_item")
    .select([
      "id",
      "title",
      "original_title",
      "year",
      "overview",
      "tagline",
      "runtime_seconds",
      "poster_path",
      "backdrop_path",
      "release_date",
      "status",
      "homepage",
      "original_language",
      "imdb_id",
      "budget",
      "revenue",
      "vote_count",
      "certification",
      "trailer_site",
      "trailer_key",
      "trailer_name",
      "collection_provider_id",
      "collection_name",
      "provider",
      "provider_id",
      "vote_average",
      "updated_at",
    ])
    .where("id", "=", id)
    .where("kind", "=", "movie")
    .executeTakeFirst();
  if (!movieRow) return null;
  const { poster_path: posterPath, backdrop_path: backdropPath, ...movie } = movieRow;

  const files = await db
    .selectFrom("media_file")
    .select([
      "id",
      "basename",
      "extension",
      "size_bytes",
      "duration_seconds",
      "video_codec",
      "audio_codec",
      "container",
    ])
    .where("media_item_id", "=", id)
    .where(accessibleLibrarySql(userId))
    .orderBy("basename", "asc")
    .execute();
  if (files.length === 0) return null;

  const progress = await db
    .selectFrom("watch_progress")
    .select(["media_file_id", "position_seconds", "duration_seconds", "completed", "updated_at"])
    .where("media_item_id", "=", id)
    .where("user_id", "=", userId)
    .execute();

  const genres = await db
    .selectFrom("media_item_genre")
    .select(["name"])
    .where("media_item_id", "=", id)
    .orderBy("position", "asc")
    .execute();
  const cast = await db
    .selectFrom("media_item_credit")
    .select(["provider", "provider_id", "name", "character_name", "profile_path", "credit_order"])
    .where("media_item_id", "=", id)
    .where("credit_type", "=", "cast")
    .orderBy("credit_order", "asc")
    .limit(12)
    .execute();
  const directors = await db
    .selectFrom("media_item_credit")
    .select(["name"])
    .where("media_item_id", "=", id)
    .where("credit_type", "=", "crew")
    .where("job", "=", "Director")
    .orderBy("credit_order", "asc")
    .execute();
  const writers = await db
    .selectFrom("media_item_credit")
    .select(["name"])
    .where("media_item_id", "=", id)
    .where("credit_type", "=", "crew")
    .where("job", "in", ["Writer", "Screenplay", "Story"])
    .orderBy("credit_order", "asc")
    .limit(4)
    .execute();
  const keywords = await db
    .selectFrom("media_item_keyword")
    .select(["name"])
    .where("media_item_id", "=", id)
    .orderBy("name", "asc")
    .limit(12)
    .execute();
  const productionCompanies = await db
    .selectFrom("media_item_production_company")
    .select(["name"])
    .where("media_item_id", "=", id)
    .orderBy("name", "asc")
    .limit(6)
    .execute();

  return {
    movie,
    files,
    progress,
    genres: genres.map((genre) => genre.name),
    cast: cast.map((credit) => ({
      provider: credit.provider,
      providerId: credit.provider_id,
      name: credit.name,
      character: credit.character_name,
      profilePath: credit.profile_path,
    })),
    directors: directors.map((credit) => credit.name),
    writers: writers.map((credit) => credit.name),
    keywords: keywords.map((keyword) => keyword.name),
    productionCompanies: productionCompanies.map((company) => company.name),
    posterUrl: tmdbImageUrl(posterPath, "w500"),
    backdropUrl: tmdbImageUrl(backdropPath, "w1280"),
  };
}

export async function getAccessibleMovieHeader(id: string, userId: string) {
  const db = await getDb();
  const movie = await db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .select(["media_item.id", "media_item.title"])
    .where("media_item.id", "=", id)
    .where("media_item.kind", "=", "movie")
    .where(accessibleLibrarySql(userId))
    .executeTakeFirst();

  return movie ?? null;
}

export async function getSimilarMovies(movieId: string, userId: string, pageInput = 1, pageSize = MOVIE_PAGE_SIZE) {
  const db = await getDb();
  const seeds = await fetchSimilaritySeeds(movieId, MOVIE_SIMILARITY_CREW);

  if (seeds.genres.length === 0 && seeds.keywords.length === 0 && seeds.people.length === 0) {
    return { movies: [], page: emptyCatalogPage(pageInput, pageSize) };
  }

  const scoreSubquery = buildSimilarityScoreSubquery(db, movieId, seeds);

  const similarMoviesBase = () =>
    db
      .selectFrom(scoreSubquery)
      .innerJoin("media_item", "media_item.id", "similar_scores.media_item_id")
      .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
      .where("media_item.kind", "=", "movie")
      .where(accessibleLibrarySql(userId));

  const totalRow = await similarMoviesBase()
    .select(sql<number>`count(distinct media_item.id)`.as("total"))
    .executeTakeFirst();
  const page = catalogPageInfo(pageInput, pageSize, Number(totalRow?.total ?? 0));
  const offset = (page.page - 1) * page.pageSize;

  const rows = await similarMoviesBase()
    .select([
      "media_item.id",
      "media_item.title",
      "media_item.year",
      "media_item.poster_path",
      "media_item.release_date",
      "media_item.popularity",
      "media_item.vote_average",
      sql<number>`count(distinct media_file.id)`.as("file_count"),
      sql<number>`max(similar_scores.score)`.as("similarity_score"),
    ])
    .groupBy("media_item.id")
    .orderBy("similarity_score", "desc")
    .orderBy("media_item.popularity", "desc")
    .orderBy("media_item.release_date", "desc")
    .limit(page.pageSize)
    .offset(offset)
    .execute();

  return {
    movies: rows.map((movie) => ({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      posterUrl: tmdbImageUrl(movie.poster_path),
      releaseDate: movie.release_date,
      popularity: movie.popularity,
      voteAverage: movie.vote_average,
      fileCount: Number(movie.file_count ?? 0),
      resumeFileId: null,
      progressSeconds: 0,
      durationSeconds: null,
      completed: false,
    })),
    page,
  };
}
