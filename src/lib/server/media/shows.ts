import type { ShowBrowseRailResponse, ShowBrowseRowsResponse, ShowRowsResponse } from "$lib/media/types";
import { sql } from "kysely";
import { resolveShowSeason } from "$lib/media/seasons";
import { getDb } from "../db";
import { tmdbImageUrl } from "$lib/media/images";
import { TV_SHOW_CREATOR_JOBS } from "../metadata/show-creators";
import {
  SHOW_PAGE_SIZE,
  accessibleLibrarySql,
  catalogPageInfo,
  emptyCatalogPage,
  normalizePage,
  searchLikePattern,
  type ShowSort,
  type ShowBrowseRail,
} from "./catalog";
import { publicMovieSummary, summarizeMovieProgress } from "./progress";
import {
  RECOMMENDATION_SEED_LIMIT,
  SHOW_SIMILARITY_CREW,
  aggregateWeightedSimilarityScores,
  buildSimilarityScoreSubquery,
  collapseSimilarityScoresToShows,
  fetchSimilaritySeeds,
  rankIdsByScore,
} from "./similarity";
import type { EpisodeBrowseRow, ShowBrowseRow } from "./types";

async function filterAccessibleShowIds(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const filtered = await filteredShows(userId);
  const rows = await showBrowseSelect(filtered).where("show.id", "in", ids).select("show.id").execute();
  const accessible = new Set(rows.map((row) => row.id));
  return ids.filter((id) => accessible.has(id));
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
  const rows = await sql<{ show_id: string }>`
    select distinct progressed_season.parent_id as show_id
    from watch_progress
    inner join media_item episode on episode.id = watch_progress.media_item_id and episode.kind = 'episode'
    inner join media_item progressed_season on progressed_season.id = episode.parent_id and progressed_season.kind = 'season'
    where watch_progress.user_id = ${userId}
      and watch_progress.completed = 1
  `.execute(db);
  return new Set(rows.rows.map((row) => row.show_id));
}

async function showBrowseRowsForIds(userId: string, ids: string[]) {
  if (ids.length === 0) return [] as ShowBrowseRow[];
  const filtered = await filteredShows(userId);
  const rows = await showBrowseSelect(filtered).where("show.id", "in", ids).execute();
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
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

export function publicShowSummary(show: ShowBrowseRow) {
  return {
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
  };
}

function publicEpisodeSummary(episode: EpisodeBrowseRow, progress: ReturnType<typeof summarizeMovieProgress>) {
  const summary = publicMovieSummary(
    {
      id: episode.id,
      title: episode.title,
      sort_title: episode.title,
      year: null,
      poster_path: episode.poster_path,
      release_date: episode.release_date,
      popularity: episode.popularity,
      vote_average: episode.vote_average,
      file_count: Number(episode.file_count ?? 0),
      latest_file_created_at: episode.latest_file_created_at,
    },
    progress,
  );

  return {
    id: episode.id,
    title: episode.title,
    showId: episode.show_id,
    showTitle: episode.show_title,
    seasonId: episode.season_id,
    seasonTitle: episode.season_title,
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
    releaseDate: episode.release_date,
    runtimeSeconds: episode.runtime_seconds,
    stillUrl: tmdbImageUrl(episode.poster_path, "w500"),
    showPosterUrl: tmdbImageUrl(episode.show_poster_path),
    fileCount: Number(episode.file_count ?? 0),
    fileId: summary.resumeFileId ?? episode.first_file_id,
    progressSeconds: summary.progressSeconds,
    durationSeconds: summary.durationSeconds,
    completed: summary.completed,
  };
}

async function filteredShows(userId: string, search = "") {
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
    .$if(searchPattern.length > 0, (qb) => qb.where(showMatchesSearchSql(searchPattern)));
}

function showMatchesSearchSql(searchPattern: string) {
  const pattern = searchLikePattern(searchPattern);
  return sql<boolean>`(
    show.title like ${pattern} escape '\\'
    or coalesce(show.original_title, '') like ${pattern} escape '\\'
    or show.sort_title like ${pattern} escape '\\'
    or episode.title like ${pattern} escape '\\'
    or media_file.basename like ${pattern} escape '\\'
    or exists (
      select 1
      from media_item_keyword
      where media_item_keyword.media_item_id = show.id
        and media_item_keyword.name like ${pattern} escape '\\'
    )
    or exists (
      select 1
      from media_item_genre
      where media_item_genre.media_item_id = show.id
        and media_item_genre.name like ${pattern} escape '\\'
    )
  )`;
}

function showBrowseSelect(filtered: Awaited<ReturnType<typeof filteredShows>>) {
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

function orderShowBrowseQuery(query: ReturnType<typeof showBrowseSelect>, sort: ShowSort) {
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

export async function showRows(userId: string, search = "", sort: ShowSort = "title") {
  const filtered = await filteredShows(userId, search);
  return (await orderShowBrowseQuery(showBrowseSelect(filtered), sort).execute()).map(publicShowSummary);
}

export async function showBrowseRows(
  userId: string,
  search?: string,
  sort?: ShowSort,
  pageInput?: number,
  pageSize?: number,
  rails?: null,
): Promise<ShowBrowseRowsResponse>;
export async function showBrowseRows(
  userId: string,
  search: string,
  sort: ShowSort,
  pageInput: number,
  pageSize: number,
  rails: readonly Exclude<ShowBrowseRail, "continueWatching" | "nextUp">[],
): Promise<ShowBrowseRailResponse>;
export async function showBrowseRows(
  userId: string,
  search = "",
  sort: ShowSort = "title",
  pageInput = 1,
  pageSize = SHOW_PAGE_SIZE,
  rails: readonly Exclude<ShowBrowseRail, "continueWatching" | "nextUp">[] | null = null,
): Promise<ShowBrowseRowsResponse | ShowBrowseRailResponse> {
  const page = normalizePage(pageInput);
  const cleanPageSize = Math.max(1, Math.min(Math.floor(pageSize), 200));
  const filtered = await filteredShows(userId, search);
  const mapShow = (show: ShowBrowseRow) => publicShowSummary(show);

  const fetchRail = async (
    rail: Exclude<ShowBrowseRail, "continueWatching" | "nextUp">,
  ): Promise<ShowBrowseRailResponse> => {
    if (rail === "recent") {
      const recentRows = await orderShowBrowseQuery(showBrowseSelect(filtered), "recent").limit(24).execute();
      return { recent: recentRows.map(mapShow) };
    }

    if (rail === "latest") {
      const latestRows = await orderShowBrowseQuery(showBrowseSelect(filtered), "latest").limit(24).execute();
      return { latest: latestRows.map(mapShow) };
    }

    if (rail === "popular") {
      const popularRows = await orderShowBrowseQuery(showBrowseSelect(filtered), "popular").limit(24).execute();
      return { popular: popularRows.map(mapShow) };
    }

    const totalRow = await filtered.select(sql<number>`count(distinct show.id)`.as("total")).executeTakeFirst();
    const total = Number(totalRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / cleanPageSize));
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * cleanPageSize;
    const allRows = await orderShowBrowseQuery(showBrowseSelect(filtered), sort)
      .limit(cleanPageSize)
      .offset(offset)
      .execute();
    return {
      all: allRows.map(mapShow),
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

  const totalRow = await filtered.select(sql<number>`count(distinct show.id)`.as("total")).executeTakeFirst();
  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / cleanPageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * cleanPageSize;

  const [allRows, recentRows, latestRows, popularRows] = await Promise.all([
    orderShowBrowseQuery(showBrowseSelect(filtered), sort).limit(cleanPageSize).offset(offset).execute(),
    orderShowBrowseQuery(showBrowseSelect(filtered), "recent").limit(24).execute(),
    orderShowBrowseQuery(showBrowseSelect(filtered), "latest").limit(24).execute(),
    orderShowBrowseQuery(showBrowseSelect(filtered), "popular").limit(24).execute(),
  ]);

  return {
    all: allRows.map(mapShow),
    allPage: {
      page: currentPage,
      pageSize: cleanPageSize,
      total,
      totalPages,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages,
    },
    recent: recentRows.map(mapShow),
    latest: latestRows.map(mapShow),
    popular: popularRows.map(mapShow),
  } satisfies ShowBrowseRowsResponse;
}

async function tvEpisodeProgress(userId: string, episodeIds: string[]) {
  if (episodeIds.length === 0) return summarizeMovieProgress([]);
  const db = await getDb();
  const rows = await db
    .selectFrom("watch_progress")
    .select(["media_item_id", "media_file_id", "position_seconds", "duration_seconds", "completed", "updated_at"])
    .where("user_id", "=", userId)
    .where("media_item_id", "in", episodeIds)
    .orderBy("updated_at", "desc")
    .execute();
  return summarizeMovieProgress(rows);
}

async function tvEpisodeRows(userId: string, mode: "continue" | "with-progress", limit = 24) {
  const db = await getDb();
  const where =
    mode === "continue"
      ? sql`
        and not exists (
          select 1
          from watch_progress completed_progress
          where completed_progress.user_id = ${userId}
            and completed_progress.media_item_id = episode.id
            and completed_progress.completed = 1
        )
        and exists (
          select 1
          from watch_progress incomplete_progress
          where incomplete_progress.user_id = ${userId}
            and incomplete_progress.media_item_id = episode.id
            and incomplete_progress.completed = 0
            and incomplete_progress.position_seconds > 0
        )
      `
      : mode === "with-progress"
        ? sql`
          and exists (
            select 1
            from watch_progress any_progress
            inner join media_item progressed_episode on progressed_episode.id = any_progress.media_item_id and progressed_episode.kind = 'episode'
            inner join media_item progressed_season on progressed_season.id = progressed_episode.parent_id and progressed_season.kind = 'season'
            where any_progress.user_id = ${userId}
              and progressed_season.parent_id = show.id
          )
        `
        : sql``;
  const order =
    mode === "continue"
      ? sql`
        (
          select max(incomplete_progress.updated_at)
          from watch_progress incomplete_progress
          where incomplete_progress.user_id = ${userId}
            and incomplete_progress.media_item_id = episode.id
            and incomplete_progress.completed = 0
            and incomplete_progress.position_seconds > 0
        ) desc,
        show.sort_title asc,
        episode.season_number asc,
        episode.episode_number asc,
        episode.title asc
      `
      : sql`show.sort_title asc, episode.season_number asc, episode.episode_number asc, episode.title asc`;

  const result = await sql<EpisodeBrowseRow>`
    select
      episode.id,
      episode.title,
      episode.overview,
      episode.season_number,
      episode.episode_number,
      episode.release_date,
      episode.runtime_seconds,
      episode.poster_path,
      episode.popularity,
      episode.vote_average,
      season.id as season_id,
      season.title as season_title,
      show.id as show_id,
      show.title as show_title,
      show.sort_title as show_sort_title,
      show.year as show_year,
      show.poster_path as show_poster_path,
      show.backdrop_path as show_backdrop_path,
      count(distinct media_file.id) as file_count,
      min(media_file.id) as first_file_id,
      max(media_file.created_at) as latest_file_created_at
    from media_item episode
    inner join media_item season on season.id = episode.parent_id and season.kind = 'season'
    inner join media_item show on show.id = season.parent_id and show.kind = 'show'
    inner join media_file on media_file.media_item_id = episode.id
    where episode.kind = 'episode'
    and ${accessibleLibrarySql(userId)}
    ${where}
    group by episode.id
    order by ${order}
    limit ${limit}
  `.execute(db);

  return result.rows;
}

async function nextUpEpisodeRows(userId: string, limit = 24) {
  const rows = await tvEpisodeRows(userId, "with-progress", 1000);
  if (rows.length === 0) return [];

  const progress = await tvEpisodeProgress(
    userId,
    rows.map((episode) => episode.id),
  );
  const completedEpisodes = progress.completedMovies;
  const inProgressEpisodes = new Set(
    rows
      .filter((episode) => {
        const latest = progress.latestIncompleteProgress.get(episode.id);
        return latest && Number(latest.position_seconds ?? 0) > 0;
      })
      .map((episode) => episode.id),
  );
  const byShow = new Map<string, EpisodeBrowseRow[]>();
  for (const row of rows) {
    const showRows = byShow.get(row.show_id) ?? [];
    showRows.push(row);
    byShow.set(row.show_id, showRows);
  }

  const nextRows: EpisodeBrowseRow[] = [];
  for (const showEpisodes of byShow.values()) {
    const latestCompletedIndex = showEpisodes.reduce(
      (latest, episode, index) => (completedEpisodes.has(episode.id) ? index : latest),
      -1,
    );
    if (latestCompletedIndex === -1) continue;
    const next = showEpisodes
      .slice(latestCompletedIndex + 1)
      .find((episode) => !completedEpisodes.has(episode.id) && !inProgressEpisodes.has(episode.id));
    if (next) nextRows.push(next);
  }

  return nextRows.slice(0, limit);
}

export async function tvRows(
  userId: string,
  search?: string,
  sort?: ShowSort,
  pageInput?: number,
  pageSize?: number,
  rails?: null,
): Promise<ShowRowsResponse>;
export async function tvRows(
  userId: string,
  search: string,
  sort: ShowSort,
  pageInput: number,
  pageSize: number,
  rails: readonly ShowBrowseRail[],
): Promise<Partial<ShowRowsResponse>>;
export async function tvRows(
  userId: string,
  search = "",
  sort: ShowSort = "title",
  pageInput = 1,
  pageSize = SHOW_PAGE_SIZE,
  rails: readonly ShowBrowseRail[] | null = null,
): Promise<ShowRowsResponse | Partial<ShowRowsResponse>> {
  const fetchRail = async (rail: ShowBrowseRail): Promise<Partial<ShowRowsResponse>> => {
    if (rail === "continueWatching") {
      const continueEpisodeRows = await tvEpisodeRows(userId, "continue");
      const progress = await tvEpisodeProgress(
        userId,
        continueEpisodeRows.map((episode) => episode.id),
      );
      return {
        continueWatching: continueEpisodeRows.map((episode) => publicEpisodeSummary(episode, progress)),
      };
    }

    if (rail === "nextUp") {
      const nextRows = await nextUpEpisodeRows(userId);
      const progress = await tvEpisodeProgress(
        userId,
        nextRows.map((episode) => episode.id),
      );
      return { nextUp: nextRows.map((episode) => publicEpisodeSummary(episode, progress)) };
    }

    return showBrowseRows(userId, search, sort, pageInput, pageSize, [rail]);
  };

  if (rails && rails.length > 0) {
    const parts = await Promise.all(rails.map((rail) => fetchRail(rail)));
    return Object.assign({}, ...parts);
  }

  const [browse, continueEpisodeRows, nextRows] = await Promise.all([
    showBrowseRows(userId, search, sort, pageInput, pageSize),
    tvEpisodeRows(userId, "continue"),
    nextUpEpisodeRows(userId),
  ]);
  const episodeIds = [...new Set([...continueEpisodeRows, ...nextRows].map((episode) => episode.id))];
  const progress = await tvEpisodeProgress(userId, episodeIds);
  const mapEpisode = (episode: EpisodeBrowseRow) => publicEpisodeSummary(episode, progress);

  return {
    continueWatching: continueEpisodeRows.map(mapEpisode),
    nextUp: nextRows.map(mapEpisode),
    all: browse.all,
    allPage: browse.allPage,
    recent: browse.recent,
    latest: browse.latest,
    popular: browse.popular,
  } satisfies ShowRowsResponse;
}

type ShowEpisodeRow = {
  id: string;
  parent_id: string | null;
  title: string;
  overview: string | null;
  season_number: number | null;
  episode_number: number | null;
  release_date: string | null;
  runtime_seconds: number | null;
  poster_path: string | null;
  file_count: number;
  first_file_id: string | null;
};

type ShowEnrichment = {
  genres: string[];
  creators: string[];
  keywords: string[];
  productionCompanies: string[];
  cast: Array<{
    provider: string | null;
    providerId: string | null;
    name: string;
    character: string | null;
    profilePath: string | null;
  }>;
};

async function fetchAccessibleShowRecord(id: string, userId: string) {
  const db = await getDb();
  return db
    .selectFrom("media_item")
    .selectAll()
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
}

async function fetchShowSeasonRecords(showId: string) {
  const db = await getDb();
  return db
    .selectFrom("media_item")
    .selectAll()
    .where("parent_id", "=", showId)
    .where("kind", "=", "season")
    .orderBy("season_number", "asc")
    .orderBy("title", "asc")
    .execute();
}

async function fetchShowEpisodeRows(seasonIds: string[], userId: string) {
  if (seasonIds.length === 0) return [] as ShowEpisodeRow[];
  const db = await getDb();
  return db
    .selectFrom("media_item as episode")
    .leftJoin("media_file", "media_file.media_item_id", "episode.id")
    .select([
      "episode.id",
      "episode.parent_id",
      "episode.title",
      "episode.overview",
      "episode.season_number",
      "episode.episode_number",
      "episode.release_date",
      "episode.runtime_seconds",
      "episode.poster_path",
      sql<number>`count(media_file.id)`.as("file_count"),
      sql<string | null>`min(media_file.id)`.as("first_file_id"),
    ])
    .where("episode.kind", "=", "episode")
    .where("episode.parent_id", "in", seasonIds)
    .where((eb) => eb.or([eb("media_file.id", "is", null), accessibleLibrarySql(userId)]))
    .groupBy("episode.id")
    .orderBy("episode.season_number", "asc")
    .orderBy("episode.episode_number", "asc")
    .orderBy("episode.title", "asc")
    .execute();
}

async function fetchShowCast(showId: string) {
  const db = await getDb();
  const cast = await db
    .selectFrom("media_item_credit")
    .select(["provider", "provider_id", "name", "character_name", "profile_path", "credit_order"])
    .where("media_item_id", "=", showId)
    .where("credit_type", "=", "cast")
    .orderBy("credit_order", "asc")
    .limit(16)
    .execute();

  return cast.map((credit) => ({
    provider: credit.provider,
    providerId: credit.provider_id,
    name: credit.name,
    character: credit.character_name,
    profilePath: credit.profile_path,
  }));
}

async function fetchShowOverviewMetadata(showId: string) {
  const db = await getDb();
  const [genres, creators, keywords, productionCompanies] = await Promise.all([
    db
      .selectFrom("media_item_genre")
      .select(["name"])
      .where("media_item_id", "=", showId)
      .orderBy("position", "asc")
      .execute(),
    db
      .selectFrom("media_item_credit")
      .select(["name"])
      .where("media_item_id", "=", showId)
      .where("credit_type", "=", "crew")
      .where("job", "in", [...TV_SHOW_CREATOR_JOBS])
      .orderBy("credit_order", "asc")
      .execute(),
    db
      .selectFrom("media_item_keyword")
      .select(["name"])
      .where("media_item_id", "=", showId)
      .orderBy("name", "asc")
      .limit(12)
      .execute(),
    db
      .selectFrom("media_item_production_company")
      .select(["name"])
      .where("media_item_id", "=", showId)
      .orderBy("name", "asc")
      .limit(6)
      .execute(),
  ]);

  return {
    genres: genres.map((genre) => genre.name),
    creators: creators.map((credit) => credit.name),
    keywords: keywords.map((keyword) => keyword.name),
    productionCompanies: productionCompanies.map((company) => company.name),
  };
}

async function fetchShowEnrichment(showId: string): Promise<ShowEnrichment> {
  const [metadata, cast] = await Promise.all([fetchShowOverviewMetadata(showId), fetchShowCast(showId)]);
  return { ...metadata, cast };
}

async function fetchSeasonStubCounts(seasonIds: string[], userId: string) {
  const counts = new Map<string, { episodeCount: number; playableCount: number; watchedCount: number }>();
  if (seasonIds.length === 0) return counts;

  const db = await getDb();
  const [episodeCounts, watchedCounts] = await Promise.all([
    db
      .selectFrom("media_item as episode")
      .leftJoin("media_file", "media_file.media_item_id", "episode.id")
      .select([
        "episode.parent_id as season_id",
        sql<number>`count(distinct episode.id)`.as("episode_count"),
        sql<number>`count(distinct case when media_file.id is not null and ${accessibleLibrarySql(userId)} then episode.id end)`.as(
          "playable_count",
        ),
      ])
      .where("episode.kind", "=", "episode")
      .where("episode.parent_id", "in", seasonIds)
      .groupBy("episode.parent_id")
      .execute(),
    db
      .selectFrom("watch_progress")
      .innerJoin("media_item as episode", "episode.id", "watch_progress.media_item_id")
      .select(["episode.parent_id as season_id", sql<number>`count(distinct episode.id)`.as("watched_count")])
      .where("watch_progress.user_id", "=", userId)
      .where(sql<boolean>`watch_progress.completed = 1`)
      .where("episode.parent_id", "in", seasonIds)
      .groupBy("episode.parent_id")
      .execute(),
  ]);

  for (const row of episodeCounts) {
    if (!row.season_id) continue;
    counts.set(row.season_id, {
      episodeCount: Number(row.episode_count ?? 0),
      playableCount: Number(row.playable_count ?? 0),
      watchedCount: 0,
    });
  }
  for (const row of watchedCounts) {
    if (!row.season_id) continue;
    const existing = counts.get(row.season_id) ?? { episodeCount: 0, playableCount: 0, watchedCount: 0 };
    counts.set(row.season_id, {
      ...existing,
      watchedCount: Number(row.watched_count ?? 0),
    });
  }

  return counts;
}

function buildPublicShow(show: NonNullable<Awaited<ReturnType<typeof fetchAccessibleShowRecord>>>, genres: string[]) {
  return {
    id: show.id,
    title: show.title,
    originalTitle: show.original_title,
    year: show.year,
    overview: show.overview,
    posterUrl: tmdbImageUrl(show.poster_path),
    backdropUrl: tmdbImageUrl(show.backdrop_path, "w1280"),
    releaseDate: show.release_date,
    status: show.status,
    voteAverage: show.vote_average,
    voteCount: show.vote_count,
    popularity: show.popularity,
    genres,
    provider: show.provider,
    providerId: show.provider_id,
    updatedAt: show.updated_at,
    certification: show.certification,
    originalLanguage: show.original_language,
    trailerSite: show.trailer_site,
    trailerKey: show.trailer_key,
  };
}

function publicShowEpisodeDetail(episode: ShowEpisodeRow, progress: ReturnType<typeof summarizeMovieProgress>) {
  const summary = publicMovieSummary(
    {
      id: episode.id,
      title: episode.title,
      sort_title: episode.title,
      year: null,
      poster_path: episode.poster_path,
      release_date: episode.release_date,
      popularity: null,
      vote_average: null,
      file_count: Number(episode.file_count ?? 0),
      latest_file_created_at: null,
    },
    progress,
  );

  return {
    id: episode.id,
    title: episode.title,
    overview: episode.overview,
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
    releaseDate: episode.release_date,
    runtimeSeconds: episode.runtime_seconds,
    stillUrl: tmdbImageUrl(episode.poster_path, "w500"),
    fileCount: Number(episode.file_count ?? 0),
    fileId: summary.resumeFileId ?? episode.first_file_id,
    progressSeconds: summary.progressSeconds,
    durationSeconds: summary.durationSeconds,
    completed: summary.completed,
  };
}

function groupEpisodesBySeason(episodeRows: ShowEpisodeRow[]) {
  const episodesBySeason = new Map<string, ShowEpisodeRow[]>();
  for (const episode of episodeRows) {
    const seasonEpisodes = episodesBySeason.get(episode.parent_id ?? "") ?? [];
    seasonEpisodes.push(episode);
    episodesBySeason.set(episode.parent_id ?? "", seasonEpisodes);
  }
  return episodesBySeason;
}

function pickShowResumeEpisode(
  episodes: Array<{
    id: string;
    fileId: string | null;
    progressSeconds: number;
    completed: boolean;
    seasonNumber: number | null;
    episodeNumber: number | null;
  }>,
) {
  const playable = episodes.filter((episode) => episode.fileId);
  const inProgress = playable.find((episode) => !episode.completed && episode.progressSeconds > 0);
  const next = inProgress ?? playable.find((episode) => !episode.completed) ?? playable[0];
  if (!next) return null;

  return {
    id: next.id,
    fileId: next.fileId,
    progressSeconds: next.progressSeconds,
    seasonNumber: next.seasonNumber,
    episodeNumber: next.episodeNumber,
  };
}

export async function getShowResumeEpisode(showId: string, userId: string) {
  const show = await fetchAccessibleShowRecord(showId, userId);
  if (!show) return null;

  const seasonRows = await fetchShowSeasonRecords(showId);
  const episodeRows = await fetchShowEpisodeRows(
    seasonRows.map((season) => season.id),
    userId,
  );
  if (episodeRows.length === 0) return null;

  const progress = await tvEpisodeProgress(
    userId,
    episodeRows.map((episode) => episode.id),
  );
  return pickShowResumeEpisode(
    episodeRows.map((episode) => {
      const detail = publicShowEpisodeDetail(episode, progress);
      return {
        id: detail.id,
        fileId: detail.fileId,
        progressSeconds: detail.progressSeconds,
        completed: detail.completed,
        seasonNumber: detail.seasonNumber,
        episodeNumber: detail.episodeNumber,
      };
    }),
  );
}

export async function getShowOverview(id: string, userId: string) {
  const show = await fetchAccessibleShowRecord(id, userId);
  if (!show) return null;

  const [metadata, seasonRows] = await Promise.all([fetchShowOverviewMetadata(id), fetchShowSeasonRecords(id)]);
  const seasonIds = seasonRows.map((season) => season.id);
  const counts = await fetchSeasonStubCounts(seasonIds, userId);

  return {
    show: buildPublicShow(show, metadata.genres),
    creators: metadata.creators,
    keywords: metadata.keywords,
    productionCompanies: metadata.productionCompanies,
    seasons: seasonRows.map((season) => {
      const seasonCounts = counts.get(season.id) ?? { episodeCount: 0, playableCount: 0, watchedCount: 0 };
      return {
        id: season.id,
        title: season.title,
        seasonNumber: season.season_number,
        overview: season.overview,
        posterUrl: tmdbImageUrl(season.poster_path),
        episodeCount: seasonCounts.episodeCount,
        playableCount: seasonCounts.playableCount,
        watchedCount: seasonCounts.watchedCount,
      };
    }),
  };
}

export async function getShowCredits(id: string, userId: string) {
  const show = await fetchAccessibleShowRecord(id, userId);
  if (!show) return null;

  const [cast, metadata] = await Promise.all([fetchShowCast(id), fetchShowOverviewMetadata(id)]);

  return {
    show: {
      id: show.id,
      title: show.title,
    },
    cast,
    creators: metadata.creators,
  };
}

export async function getShowSeasonDetail(showId: string, seasonKey: string, userId: string) {
  const show = await fetchAccessibleShowRecord(showId, userId);
  if (!show) return null;

  const seasonRows = await fetchShowSeasonRecords(showId);
  const resolvedSeason = resolveShowSeason(
    seasonRows.map((season) => ({ id: season.id, seasonNumber: season.season_number })),
    seasonKey,
  );
  if (!resolvedSeason) return null;

  const season = seasonRows.find((row) => row.id === resolvedSeason.id);
  if (!season) return null;

  const [metadata, episodeRows] = await Promise.all([
    fetchShowOverviewMetadata(showId),
    fetchShowEpisodeRows([season.id], userId),
  ]);
  const progress = await tvEpisodeProgress(
    userId,
    episodeRows.map((episode) => episode.id),
  );

  return {
    show: buildPublicShow(show, metadata.genres),
    season: {
      id: season.id,
      title: season.title,
      seasonNumber: season.season_number,
      overview: season.overview,
      posterUrl: tmdbImageUrl(season.poster_path),
      episodes: episodeRows.map((episode) => publicShowEpisodeDetail(episode, progress)),
    },
    seasons: seasonRows.map((row) => ({
      id: row.id,
      title: row.title,
      seasonNumber: row.season_number,
    })),
  };
}

export async function getShowDetail(id: string, userId: string) {
  const show = await fetchAccessibleShowRecord(id, userId);
  if (!show) return null;

  const [enrichment, seasonRows] = await Promise.all([fetchShowEnrichment(id), fetchShowSeasonRecords(id)]);
  const seasonIds = seasonRows.map((season) => season.id);
  const episodeRows = await fetchShowEpisodeRows(seasonIds, userId);
  const progress = await tvEpisodeProgress(
    userId,
    episodeRows.map((episode) => episode.id),
  );
  const episodesBySeason = groupEpisodesBySeason(episodeRows);

  return {
    show: buildPublicShow(show, enrichment.genres),
    creators: enrichment.creators,
    keywords: enrichment.keywords,
    productionCompanies: enrichment.productionCompanies,
    cast: enrichment.cast,
    seasons: seasonRows.map((season) => ({
      id: season.id,
      title: season.title,
      seasonNumber: season.season_number,
      overview: season.overview,
      posterUrl: tmdbImageUrl(season.poster_path),
      episodes: (episodesBySeason.get(season.id) ?? []).map((episode) => publicShowEpisodeDetail(episode, progress)),
    })),
  };
}

export async function getEpisodeDetail(id: string, userId: string) {
  const db = await getDb();
  const episode = await db
    .selectFrom("media_item")
    .selectAll()
    .where("id", "=", id)
    .where("kind", "=", "episode")
    .executeTakeFirst();
  if (!episode?.parent_id) return null;

  const season = await db
    .selectFrom("media_item")
    .selectAll()
    .where("id", "=", episode.parent_id)
    .where("kind", "=", "season")
    .executeTakeFirst();
  if (!season?.parent_id) return null;

  const show = await db
    .selectFrom("media_item")
    .selectAll()
    .where("id", "=", season.parent_id)
    .where("kind", "=", "show")
    .executeTakeFirst();
  if (!show) return null;

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
    .innerJoin("media_file", "media_file.id", "watch_progress.media_file_id")
    .select([
      "watch_progress.media_file_id",
      "watch_progress.position_seconds",
      "watch_progress.duration_seconds",
      "watch_progress.completed",
      "watch_progress.updated_at",
    ])
    .where("watch_progress.media_item_id", "=", id)
    .where("watch_progress.user_id", "=", userId)
    .where(accessibleLibrarySql(userId))
    .execute();

  return {
    show: {
      id: show.id,
      title: show.title,
      posterUrl: tmdbImageUrl(show.poster_path),
      backdropUrl: tmdbImageUrl(show.backdrop_path, "w1280"),
    },
    season: {
      id: season.id,
      title: season.title,
      seasonNumber: season.season_number,
    },
    episode: {
      id: episode.id,
      title: episode.title,
      overview: episode.overview,
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number,
      releaseDate: episode.release_date,
      runtimeSeconds: episode.runtime_seconds,
      stillUrl: tmdbImageUrl(episode.poster_path, "w780"),
      voteAverage: episode.vote_average,
    },
    files,
    progress,
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
