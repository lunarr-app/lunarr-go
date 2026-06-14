import { sql } from "kysely";
import { currentDatabasePaths, getDb } from "./db";

async function countRows(table: "library" | "media_item" | "media_file" | "scan_job") {
  const db = await getDb();
  const row = await db
    .selectFrom(table)
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

export async function getServerStatus() {
  const db = await getDb();
  const paths = currentDatabasePaths();
  const activeScanRow = await db
    .selectFrom("scan_job")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();
  const scanErrorRow = await db
    .selectFrom("scan_job_error")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .executeTakeFirst();
  const lastScan = await db
    .selectFrom("scan_job")
    .select(["status", "finished_at", "created_at"])
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  const playableMovieBase = db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .where("media_item.kind", "=", "movie");
  const movieRow = await playableMovieBase
    .select(sql<number>`count(distinct media_item.id)`.as("count"))
    .executeTakeFirst();
  const matchedMovieRow = await playableMovieBase
    .select(sql<number>`count(distinct media_item.id)`.as("count"))
    .where("media_item.provider", "is not", null)
    .where("media_item.provider_id", "is not", null)
    .executeTakeFirst();
  const posterRow = await playableMovieBase
    .select(sql<number>`count(distinct media_item.id)`.as("count"))
    .where(sql`coalesce(media_item.poster_path, '')`, "!=", "")
    .executeTakeFirst();
  const playableShowRow = await db
    .selectFrom("media_item as show")
    .innerJoin("media_item as season", "season.parent_id", "show.id")
    .innerJoin("media_item as episode", "episode.parent_id", "season.id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
    .where("show.kind", "=", "show")
    .where("season.kind", "=", "season")
    .where("episode.kind", "=", "episode")
    .select(sql<number>`count(distinct show.id)`.as("count"))
    .executeTakeFirst();
  const matchedShowRow = await db
    .selectFrom("media_item as show")
    .innerJoin("media_item as season", "season.parent_id", "show.id")
    .innerJoin("media_item as episode", "episode.parent_id", "season.id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
    .where("show.kind", "=", "show")
    .where("season.kind", "=", "season")
    .where("episode.kind", "=", "episode")
    .where("show.provider", "is not", null)
    .where("show.provider_id", "is not", null)
    .select(sql<number>`count(distinct show.id)`.as("count"))
    .executeTakeFirst();
  const showPosterRow = await db
    .selectFrom("media_item as show")
    .innerJoin("media_item as season", "season.parent_id", "show.id")
    .innerJoin("media_item as episode", "episode.parent_id", "season.id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
    .where("show.kind", "=", "show")
    .where("season.kind", "=", "season")
    .where("episode.kind", "=", "episode")
    .where(sql`coalesce(show.poster_path, '')`, "!=", "")
    .select(sql<number>`count(distinct show.id)`.as("count"))
    .executeTakeFirst();
  const playableEpisodeRow = await db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .where("media_item.kind", "=", "episode")
    .select(sql<number>`count(distinct media_item.id)`.as("count"))
    .executeTakeFirst();
  const matchedEpisodeRow = await db
    .selectFrom("media_item")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .where("media_item.kind", "=", "episode")
    .where("media_item.provider", "is not", null)
    .where("media_item.provider_id", "is not", null)
    .select(sql<number>`count(distinct media_item.id)`.as("count"))
    .executeTakeFirst();

  return {
    dataDir: paths.dataDir,
    dbFile: paths.dbFile,
    libraries: await countRows("library"),
    mediaFiles: await countRows("media_file"),
    movies: Number(movieRow?.count ?? 0),
    shows: Number(playableShowRow?.count ?? 0),
    episodes: Number(playableEpisodeRow?.count ?? 0),
    matchedMovies: Number(matchedMovieRow?.count ?? 0),
    moviesWithPosters: Number(posterRow?.count ?? 0),
    matchedShows: Number(matchedShowRow?.count ?? 0),
    showsWithPosters: Number(showPosterRow?.count ?? 0),
    matchedEpisodes: Number(matchedEpisodeRow?.count ?? 0),
    scanJobs: await countRows("scan_job"),
    activeScanJobs: Number(activeScanRow?.count ?? 0),
    scanErrors: Number(scanErrorRow?.count ?? 0),
    lastScan,
  };
}
