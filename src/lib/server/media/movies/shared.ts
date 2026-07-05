import { sql } from "kysely";
import { getDb } from "../../db";
import { accessibleLibrarySql } from "../catalog";
import { publicMovieSummary } from "../progress";
import type { MovieBrowseRow } from "../types";

export function publicMovieListItem(summary: ReturnType<typeof publicMovieSummary>) {
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

export function movieBrowseSelect(db: Awaited<ReturnType<typeof getDb>>) {
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

export async function movieBrowseRowsForIds(userId: string, ids: string[]) {
  if (ids.length === 0) return [] as MovieBrowseRow[];
  const db = await getDb();
  const rows = await movieBrowseSelect(db)
    .where("media_item.id", "in", ids)
    .where(accessibleLibrarySql(userId))
    .execute();
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}
