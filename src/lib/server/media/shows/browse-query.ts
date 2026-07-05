import { sql } from "kysely";
import { getDb } from "../../db";
import { accessibleLibrarySql, browseMatchesSearchSql, type ShowSort } from "../catalog";

export const SHOW_BROWSE_SEARCH_LIKE_EXPRESSIONS = [
  "show.title",
  "coalesce(show.original_title, '')",
  "show.sort_title",
  "episode.title",
  "media_file.basename",
] as const;

export async function filteredShows(userId: string, search = "") {
  const db = await getDb();
  const searchPattern = search.trim();
  return db
    .selectFrom("media_item as show")
    .innerJoin("media_item as season", "season.parent_id", "show.id")
    .innerJoin("media_item as episode", "episode.parent_id", "season.id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
    .where("show.kind", "=", "show")
    .where("season.kind", "=", "season")
    .where("episode.kind", "=", "episode")
    .where(accessibleLibrarySql(userId))
    .$if(searchPattern.length > 0, (qb) =>
      qb.where(browseMatchesSearchSql(searchPattern, "show.id", SHOW_BROWSE_SEARCH_LIKE_EXPRESSIONS)),
    );
}

export function showBrowseSelect(filtered: Awaited<ReturnType<typeof filteredShows>>) {
  return filtered
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
    .groupBy("show.id");
}

export function orderShowBrowseQuery(query: ReturnType<typeof showBrowseSelect>, sort: ShowSort) {
  if (sort === "recent") {
    return query.orderBy(sql<string | null>`max(media_file.created_at)`, "desc").orderBy("show.sort_title", "asc");
  }
  if (sort === "latest") {
    return query.orderBy(sql<string | null>`max(episode.release_date)`, "desc").orderBy("show.sort_title", "asc");
  }
  if (sort === "popular") {
    return query
      .orderBy("show.popularity", "desc")
      .orderBy("show.vote_average", "desc")
      .orderBy("show.sort_title", "asc");
  }
  return query.orderBy("show.sort_title", "asc").orderBy("show.title", "asc");
}
