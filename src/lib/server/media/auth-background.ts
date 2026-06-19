import { tmdbImageUrl } from "$lib/media/images";
import { sql } from "kysely";
import { getDb } from "../db";

export const AUTH_BACKGROUND_MIN_POSTERS = 8;
export const AUTH_BACKGROUND_POSTER_POOL = 24;
export const AUTH_BACKGROUND_GRID_SLOTS = 48;
export const AUTH_BACKGROUND_IMAGE_SIZE = "w154";

async function listMoviePosterPaths(limit: number) {
  const db = await getDb();
  const rows = await db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .where("media_item.kind", "=", "movie")
    .where("media_item.poster_path", "is not", null)
    .select("media_item.poster_path")
    .groupBy("media_item.id")
    .orderBy(sql`RANDOM()`)
    .limit(limit)
    .execute();

  return rows.map((row) => row.poster_path).filter((path): path is string => Boolean(path));
}

async function listShowPosterPaths(limit: number) {
  const db = await getDb();
  const rows = await db
    .selectFrom("media_item as show")
    .innerJoin("media_item as season", "season.parent_id", "show.id")
    .innerJoin("media_item as episode", "episode.parent_id", "season.id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
    .where("show.kind", "=", "show")
    .where("season.kind", "=", "season")
    .where("episode.kind", "=", "episode")
    .where("show.poster_path", "is not", null)
    .select("show.poster_path")
    .groupBy("show.id")
    .orderBy(sql`RANDOM()`)
    .limit(limit)
    .execute();

  return rows.map((row) => row.poster_path).filter((path): path is string => Boolean(path));
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function fillGrid(urls: string[], slots: number) {
  return Array.from({ length: slots }, (_, index) => urls[index % urls.length]);
}

export async function listAuthBackgroundPosters() {
  const [moviePaths, showPaths] = await Promise.all([
    listMoviePosterPaths(AUTH_BACKGROUND_POSTER_POOL),
    listShowPosterPaths(AUTH_BACKGROUND_POSTER_POOL),
  ]);

  const uniquePaths = [...new Set([...moviePaths, ...showPaths])];
  if (uniquePaths.length < AUTH_BACKGROUND_MIN_POSTERS) {
    return [];
  }

  const posterUrls = shuffle(uniquePaths)
    .map((path) => tmdbImageUrl(path, AUTH_BACKGROUND_IMAGE_SIZE))
    .filter((url): url is string => Boolean(url));

  if (posterUrls.length < AUTH_BACKGROUND_MIN_POSTERS) {
    return [];
  }

  return fillGrid(posterUrls, AUTH_BACKGROUND_GRID_SLOTS);
}
