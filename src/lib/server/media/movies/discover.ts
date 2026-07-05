import { sql } from "kysely";
import { tmdbImageUrl } from "$lib/media/images";
import { getDb } from "../../db";
import { MOVIE_PAGE_SIZE, accessibleLibrarySql, catalogPageInfo, emptyCatalogPage } from "../catalog";
import { publicMovieSummary, summarizeMovieProgress } from "../progress";
import {
  MOVIE_SIMILARITY_CREW,
  RECOMMENDATION_SEED_LIMIT,
  aggregateWeightedSimilarityScores,
  buildSimilarityScoreSubquery,
  fetchSimilaritySeeds,
  rankIdsByScore,
} from "../similarity";
import type { MovieBrowseRow } from "../types";
import { movieBrowseRowsForIds, publicMovieListItem } from "./shared";

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
