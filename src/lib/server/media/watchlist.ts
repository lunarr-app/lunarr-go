import { sql } from "kysely";
import { getDb } from "../db";
import { nowIso } from "../time";
import type { CatalogPageInfo, MovieSummary, ShowSummary } from "$lib/media/types";
import { tmdbImageUrl } from "$lib/media/images";
import { catalogPageInfo, FULL_LIBRARY_PAGE_SIZE, accessibleLibrarySql } from "./catalog";
import { summarizeMovieProgress, publicMovieSummary } from "./progress";

export async function isInWatchlist(userId: string, mediaItemId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db
    .selectFrom("watchlist")
    .select("media_item_id")
    .where("user_id", "=", userId)
    .where("media_item_id", "=", mediaItemId)
    .executeTakeFirst();
  return !!row;
}

export async function toggleWatchlist(userId: string, mediaItemId: string): Promise<boolean> {
  const db = await getDb();
  const existing = await db
    .selectFrom("watchlist")
    .select("media_item_id")
    .where("user_id", "=", userId)
    .where("media_item_id", "=", mediaItemId)
    .executeTakeFirst();

  if (existing) {
    await db.deleteFrom("watchlist").where("user_id", "=", userId).where("media_item_id", "=", mediaItemId).execute();
    return false;
  }

  await db
    .insertInto("watchlist")
    .values({ user_id: userId, media_item_id: mediaItemId, created_at: nowIso() })
    .execute();
  return true;
}

export async function removeFromWatchlist(userId: string, mediaItemId: string): Promise<void> {
  const db = await getDb();
  await db.deleteFrom("watchlist").where("user_id", "=", userId).where("media_item_id", "=", mediaItemId).execute();
}

export async function getWatchlistMovies(
  userId: string,
  page = 1,
  pageSize = FULL_LIBRARY_PAGE_SIZE,
): Promise<{ movies: MovieSummary[]; pageInfo: CatalogPageInfo }> {
  const db = await getDb();

  const watchlistItemIds = await db
    .selectFrom("watchlist")
    .select("media_item_id")
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();

  const movieIds: string[] = [];
  for (const w of watchlistItemIds) {
    const item = await db.selectFrom("media_item").select("kind").where("id", "=", w.media_item_id).executeTakeFirst();
    if (item?.kind === "movie") movieIds.push(w.media_item_id);
  }

  if (movieIds.length === 0) {
    return { movies: [], pageInfo: catalogPageInfo(page, pageSize, 0) };
  }

  const orderMap = new Map(movieIds.map((id, index) => [id, index]));
  const rows = await db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .where("media_item.id", "in", movieIds)
    .where("media_item.kind", "=", "movie")
    .where(accessibleLibrarySql(userId))
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
    .groupBy("media_item.id")
    .execute();

  const sorted = rows
    .map((row) => ({ ...row, _order: orderMap.get(row.id) ?? Infinity }))
    .sort((a, b) => a._order - b._order);

  const total = sorted.length;
  const pageInfo = catalogPageInfo(page, pageSize, total);
  const offset = (pageInfo.page - 1) * pageInfo.pageSize;
  const paged = sorted.slice(offset, offset + pageInfo.pageSize);

  const progressRows = await db
    .selectFrom("watch_progress")
    .select(["media_item_id", "media_file_id", "position_seconds", "duration_seconds", "completed", "updated_at"])
    .where("user_id", "=", userId)
    .where(
      "media_item_id",
      "in",
      paged.map((m) => m.id),
    )
    .orderBy("updated_at", "desc")
    .execute();

  const progress = summarizeMovieProgress(progressRows);
  const movies = paged.map((movie) => publicMovieSummary(movie, progress));

  return { movies, pageInfo };
}

export async function getWatchlistShows(
  userId: string,
  page = 1,
  pageSize = FULL_LIBRARY_PAGE_SIZE,
): Promise<{ shows: ShowSummary[]; pageInfo: CatalogPageInfo }> {
  const db = await getDb();

  const watchlistItemIds = await db
    .selectFrom("watchlist")
    .select("media_item_id")
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();

  const showIds: string[] = [];
  for (const w of watchlistItemIds) {
    const item = await db.selectFrom("media_item").select("kind").where("id", "=", w.media_item_id).executeTakeFirst();
    if (item?.kind === "show") showIds.push(w.media_item_id);
  }

  if (showIds.length === 0) {
    return { shows: [], pageInfo: catalogPageInfo(page, pageSize, 0) };
  }

  const orderMap = new Map(showIds.map((id, index) => [id, index]));
  const rows = await db
    .selectFrom("media_item as show")
    .innerJoin("media_item as season", "season.parent_id", "show.id")
    .innerJoin("media_item as episode", "episode.parent_id", "season.id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
    .where("show.id", "in", showIds)
    .where("show.kind", "=", "show")
    .where("season.kind", "=", "season")
    .where("episode.kind", "=", "episode")
    .where(accessibleLibrarySql(userId))
    .select([
      "show.id",
      "show.title",
      "show.sort_title",
      "show.year",
      "show.poster_path",
      "show.backdrop_path",
      "show.release_date",
      "show.status",
      "show.popularity",
      "show.vote_average",
      sql<number>`count(distinct episode.id)`.as("episode_count"),
      sql<number>`count(distinct season.id)`.as("season_count"),
      sql<string | null>`max(media_file.created_at)`.as("latest_file_created_at"),
      sql<string | null>`max(episode.release_date)`.as("latest_episode_release_date"),
    ])
    .groupBy("show.id")
    .execute();

  const sorted = rows
    .map((row) => ({ ...row, _order: orderMap.get(row.id) ?? Infinity }))
    .sort((a, b) => a._order - b._order);

  const total = sorted.length;
  const pageInfo = catalogPageInfo(page, pageSize, total);
  const offset = (pageInfo.page - 1) * pageInfo.pageSize;
  const paged = sorted.slice(offset, offset + pageInfo.pageSize);

  const shows: ShowSummary[] = paged.map((show) => ({
    id: show.id,
    title: show.title,
    year: show.year,
    posterUrl: tmdbImageUrl(show.poster_path),
    backdropUrl: tmdbImageUrl(show.backdrop_path, "w780"),
    releaseDate: show.release_date,
    status: show.status,
    popularity: show.popularity,
    voteAverage: show.vote_average,
    episodeCount: Number(show.episode_count ?? 0),
    seasonCount: Number(show.season_count ?? 0),
    latestFileCreatedAt: show.latest_file_created_at,
    latestEpisodeReleaseDate: show.latest_episode_release_date,
  }));

  return { shows, pageInfo };
}
