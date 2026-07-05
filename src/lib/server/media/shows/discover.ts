import { sql } from "kysely";
import { getDb } from "../../db";
import { SHOW_PAGE_SIZE, accessibleLibrarySql, catalogPageInfo, emptyCatalogPage } from "../catalog";
import {
  RECOMMENDATION_SEED_LIMIT,
  SHOW_SIMILARITY_CREW,
  aggregateWeightedSimilarityScores,
  buildSimilarityScoreSubquery,
  collapseSimilarityScoresToShows,
  fetchSimilaritySeeds,
  rankIdsByScore,
} from "../similarity";
import { filteredShows, showBrowseSelect } from "./browse-query";
import { publicShowSummary, showBrowseRowsForIds } from "./browse";

async function filterAccessibleShowIds(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await showBrowseSelect(await filteredShows(userId))
    .where("show.id", "in", ids)
    .select("show.id")
    .execute();
  const accessible = new Set(rows.map((row) => row.id));
  return ids.filter((id) => accessible.has(id));
}

async function fetchRecentShowSeeds(userId: string, limit = RECOMMENDATION_SEED_LIMIT) {
  const db = await getDb();
  const rows = await db
    .selectFrom("watch_progress")
    .innerJoin("media_item as episode", "episode.id", "watch_progress.media_item_id")
    .innerJoin("media_item as season", "season.id", "episode.parent_id")
    .innerJoin("media_item as show", "show.id", "season.parent_id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
    .where("watch_progress.user_id", "=", userId)
    .where("episode.kind", "=", "episode")
    .where("season.kind", "=", "season")
    .where("show.kind", "=", "show")
    .where(sql<boolean>`(watch_progress.position_seconds > 0 or watch_progress.completed = 1)`)
    .where(accessibleLibrarySql(userId))
    .select("show.id")
    .groupBy("show.id")
    .orderBy(sql<string>`max(watch_progress.updated_at)`, "desc")
    .limit(limit)
    .execute();
  return rows.map((row) => row.id);
}

async function showsWithCompletedEpisodeForUser(userId: string) {
  const db = await getDb();
  const rows = await db
    .selectFrom("watch_progress")
    .innerJoin("media_item as episode", "episode.id", "watch_progress.media_item_id")
    .innerJoin("media_item as progressed_season", "progressed_season.id", "episode.parent_id")
    .select(sql<string>`progressed_season.parent_id`.as("show_id"))
    .where("watch_progress.user_id", "=", userId)
    .where("episode.kind", "=", "episode")
    .where("progressed_season.kind", "=", "season")
    .where(sql<boolean>`watch_progress.completed = 1`)
    .distinct()
    .execute();
  return new Set(rows.map((row) => row.show_id));
}

async function rankedBecauseYouWatchedShowIds(userId: string) {
  const db = await getDb();
  const seedIds = await fetchRecentShowSeeds(userId);
  if (seedIds.length === 0) return [];

  const watchedShowIds = await showsWithCompletedEpisodeForUser(userId);
  const excludeIds = new Set([...seedIds, ...watchedShowIds]);
  const scores = await aggregateWeightedSimilarityScores(db, seedIds, SHOW_SIMILARITY_CREW);
  const showScores = await collapseSimilarityScoresToShows(db, scores);
  const ranked = rankIdsByScore(showScores, excludeIds);
  return filterAccessibleShowIds(userId, ranked);
}

export async function listBecauseYouWatchedShows(userId: string, pageInput = 1, pageSize = SHOW_PAGE_SIZE) {
  const rankedIds = await rankedBecauseYouWatchedShowIds(userId);
  const page = catalogPageInfo(pageInput, pageSize, rankedIds.length);
  const offset = (page.page - 1) * page.pageSize;
  const browseRows = await showBrowseRowsForIds(userId, rankedIds.slice(offset, offset + page.pageSize));
  return {
    shows: browseRows.map(publicShowSummary),
    page,
  };
}

export async function getAccessibleShowHeader(id: string, userId: string) {
  const db = await getDb();
  const show = await db
    .selectFrom("media_item")
    .select(["id", "title"])
    .where("id", "=", id)
    .where("kind", "=", "show")
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("media_item as season")
          .innerJoin("media_item as episode", "episode.parent_id", "season.id")
          .innerJoin("media_file", "media_file.media_item_id", "episode.id")
          .select("media_file.id")
          .whereRef("season.parent_id", "=", "media_item.id")
          .where("season.kind", "=", "season")
          .where("episode.kind", "=", "episode")
          .where(accessibleLibrarySql(userId)),
      ),
    )
    .executeTakeFirst();

  return show ?? null;
}

export async function getSimilarShows(showId: string, userId: string, pageInput = 1, pageSize = SHOW_PAGE_SIZE) {
  const db = await getDb();
  const seeds = await fetchSimilaritySeeds(showId, SHOW_SIMILARITY_CREW);

  if (seeds.genres.length === 0 && seeds.keywords.length === 0 && seeds.people.length === 0) {
    return { shows: [], page: emptyCatalogPage(pageInput, pageSize) };
  }

  const scoreSubquery = buildSimilarityScoreSubquery(db, showId, seeds);

  const similarShowsBase = () =>
    db
      .selectFrom(scoreSubquery)
      .innerJoin("media_item as show", "show.id", "similar_scores.media_item_id")
      .innerJoin("media_item as season", "season.parent_id", "show.id")
      .innerJoin("media_item as episode", "episode.parent_id", "season.id")
      .innerJoin("media_file", "media_file.media_item_id", "episode.id")
      .where("show.kind", "=", "show")
      .where("season.kind", "=", "season")
      .where("episode.kind", "=", "episode")
      .where(accessibleLibrarySql(userId));

  const totalRow = await similarShowsBase()
    .select(sql<number>`count(distinct show.id)`.as("total"))
    .executeTakeFirst();
  const page = catalogPageInfo(pageInput, pageSize, Number(totalRow?.total ?? 0));
  const offset = (page.page - 1) * page.pageSize;

  const rows = await similarShowsBase()
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
      sql<number>`max(similar_scores.score)`.as("similarity_score"),
    ])
    .groupBy("show.id")
    .orderBy("similarity_score", "desc")
    .orderBy("show.popularity", "desc")
    .orderBy("show.release_date", "desc")
    .limit(page.pageSize)
    .offset(offset)
    .execute();

  return {
    shows: rows.map(publicShowSummary),
    page,
  };
}
