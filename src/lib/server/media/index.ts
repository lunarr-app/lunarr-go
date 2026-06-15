import { sql } from "kysely";
import { getDb } from "../db";
import { tmdbImageUrl } from "$lib/media/images";

export const MOVIE_STATUS_FILTERS = ["all", "watched", "unwatched"] as const;
export const MOVIE_SORTS = ["title", "recent", "year_desc", "rating", "release_date"] as const;
export const MOVIE_PAGE_SIZE = 36;
export const SHOW_SORTS = ["title", "recent", "latest", "popular"] as const;

export type MovieStatusFilter = (typeof MOVIE_STATUS_FILTERS)[number];
export type MovieSort = (typeof MOVIE_SORTS)[number];
export type ShowSort = (typeof SHOW_SORTS)[number];

export function normalizeMovieStatusFilter(value: string | null | undefined): MovieStatusFilter {
  return MOVIE_STATUS_FILTERS.includes(value as MovieStatusFilter) ? (value as MovieStatusFilter) : "all";
}

export function normalizeMovieSort(value: string | null | undefined): MovieSort {
  return MOVIE_SORTS.includes(value as MovieSort) ? (value as MovieSort) : "title";
}

export function normalizeShowSort(value: string | null | undefined): ShowSort {
  return SHOW_SORTS.includes(value as ShowSort) ? (value as ShowSort) : "title";
}

export function normalizeMoviePage(value: string | number | null | undefined) {
  const page = Number(value ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function accessibleLibrarySql(userId: string, libraryIdRef = "media_file.library_id") {
  return sql<boolean>`(
    exists (
      select 1
      from user
      where user.id = ${userId}
        and user.role = 'admin'
    )
    or exists (
      select 1
      from library
      where library.id = ${sql.ref(libraryIdRef)}
        and library.access_mode = 'all'
    )
    or exists (
      select 1
      from library_user
      where library_user.library_id = ${sql.ref(libraryIdRef)}
        and library_user.user_id = ${userId}
    )
  )`;
}

type MovieBrowseRow = {
  id: string;
  title: string;
  sort_title: string;
  year: number | null;
  poster_path: string | null;
  release_date: string | null;
  popularity: number | null;
  vote_average: number | null;
  file_count: number;
  latest_file_created_at: string | null;
};

type MovieProgressRow = {
  media_item_id: string;
  media_file_id: string;
  position_seconds: number;
  duration_seconds: number | null;
  completed: boolean | number;
  updated_at: string;
};

type ShowBrowseRow = {
  id: string;
  title: string;
  sort_title: string;
  year: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  status: string | null;
  popularity: number | null;
  vote_average: number | null;
  episode_count: number;
  season_count: number;
  latest_file_created_at: string | null;
  latest_episode_release_date: string | null;
};

type EpisodeBrowseRow = {
  id: string;
  title: string;
  overview: string | null;
  season_number: number | null;
  episode_number: number | null;
  release_date: string | null;
  runtime_seconds: number | null;
  poster_path: string | null;
  popularity: number | null;
  vote_average: number | null;
  season_id: string;
  season_title: string;
  show_id: string;
  show_title: string;
  show_sort_title: string;
  show_year: number | null;
  show_poster_path: string | null;
  show_backdrop_path: string | null;
  file_count: number;
  first_file_id: string | null;
  latest_file_created_at: string | null;
};

function summarizeMovieProgress(progressRows: MovieProgressRow[]) {
  const latestProgress = new Map<string, MovieProgressRow>();
  const latestIncompleteProgress = new Map<string, MovieProgressRow>();
  const completedMovies = new Set<string>();

  for (const row of progressRows) {
    if (!latestProgress.has(row.media_item_id)) {
      latestProgress.set(row.media_item_id, row);
    }
    if (Number(row.completed ?? 0) > 0) {
      completedMovies.add(row.media_item_id);
    } else if (Number(row.position_seconds ?? 0) > 0 && !latestIncompleteProgress.has(row.media_item_id)) {
      latestIncompleteProgress.set(row.media_item_id, row);
    }
  }

  return { latestProgress, latestIncompleteProgress, completedMovies };
}

function publicMovieSummary(
  movie: MovieBrowseRow & { character?: string | null },
  progress: ReturnType<typeof summarizeMovieProgress>,
) {
  const completed = progress.completedMovies.has(movie.id);
  const progressRow = completed
    ? progress.latestProgress.get(movie.id)
    : (progress.latestIncompleteProgress.get(movie.id) ?? progress.latestProgress.get(movie.id));

  return {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    posterUrl: tmdbImageUrl(movie.poster_path),
    releaseDate: movie.release_date,
    popularity: movie.popularity,
    voteAverage: movie.vote_average,
    fileCount: Number(movie.file_count ?? 0),
    resumeFileId: progressRow?.media_file_id ?? null,
    progressSeconds: Number(progressRow?.position_seconds ?? 0),
    durationSeconds:
      progressRow?.duration_seconds === undefined || progressRow.duration_seconds === null
        ? null
        : Number(progressRow.duration_seconds),
    completed,
    progressUpdatedAt: progressRow?.updated_at ?? null,
    character: movie.character ?? null,
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
  const page = normalizeMoviePage(pageInput);
  const cleanPageSize = Math.max(1, Math.min(Math.floor(pageSize), 200));

  const filteredMovies = () =>
    db
      .selectFrom("media_item")
      .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
      .where("media_item.kind", "=", "movie")
      .where(accessibleLibrarySql(userId))
      .$if(searchPattern.length > 0, (qb) =>
        qb.where(sql<boolean>`media_item.title like ${`%${escapeLikePattern(searchPattern)}%`} escape '\\'`),
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

  const publicMovie = (movie: ReturnType<typeof mapMovie>) => ({
    id: movie.id,
    title: movie.title,
    year: movie.year,
    posterUrl: movie.posterUrl,
    releaseDate: movie.releaseDate,
    popularity: movie.popularity,
    voteAverage: movie.voteAverage,
    fileCount: movie.fileCount,
    resumeFileId: movie.resumeFileId,
    progressSeconds: movie.progressSeconds,
    durationSeconds: movie.durationSeconds,
    completed: movie.completed,
  });

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

export async function movieListRows(
  userId: string,
  search = "",
  status: MovieStatusFilter = "all",
  sort: MovieSort = "title",
  pageInput = 1,
  pageSize = MOVIE_PAGE_SIZE,
) {
  const rows = await movieRows(userId, search, status, sort, pageInput, pageSize);
  return {
    movies: rows.all,
    page: rows.allPage,
  };
}

function publicShowSummary(show: ShowBrowseRow) {
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

export async function showRows(userId: string, search = "", sort: ShowSort = "title") {
  const db = await getDb();
  const searchPattern = search.trim();
  const query = db
    .selectFrom("media_item as show")
    .innerJoin("media_item as season", "season.parent_id", "show.id")
    .innerJoin("media_item as episode", "episode.parent_id", "season.id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
    .where("show.kind", "=", "show")
    .where("season.kind", "=", "season")
    .where("episode.kind", "=", "episode")
    .where(accessibleLibrarySql(userId))
    .$if(searchPattern.length > 0, (qb) =>
      qb.where(sql<boolean>`show.title like ${`%${escapeLikePattern(searchPattern)}%`} escape '\\'`),
    )
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

  const ordered =
    sort === "recent"
      ? query.orderBy(sql<string | null>`max(media_file.created_at)`, "desc").orderBy("show.sort_title", "asc")
      : sort === "latest"
        ? query.orderBy(sql<string | null>`max(episode.release_date)`, "desc").orderBy("show.sort_title", "asc")
        : sort === "popular"
          ? query
              .orderBy("show.popularity", "desc")
              .orderBy("show.vote_average", "desc")
              .orderBy("show.sort_title", "asc")
          : query.orderBy("show.sort_title", "asc").orderBy("show.title", "asc");

  return (await ordered.execute()).map(publicShowSummary);
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

export async function tvRows(userId: string, search = "", sort: ShowSort = "title") {
  const [allShows, continueEpisodeRows, nextRows, recentlyAiredShows, popularShows] = await Promise.all([
    showRows(userId, search, sort),
    tvEpisodeRows(userId, "continue"),
    nextUpEpisodeRows(userId),
    showRows(userId, "", "latest"),
    showRows(userId, "", "popular"),
  ]);
  const episodeIds = [...new Set([...continueEpisodeRows, ...nextRows].map((episode) => episode.id))];
  const progress = await tvEpisodeProgress(userId, episodeIds);
  const mapEpisode = (episode: EpisodeBrowseRow) => publicEpisodeSummary(episode, progress);

  return {
    continueWatching: continueEpisodeRows.map(mapEpisode),
    nextUp: nextRows.map(mapEpisode),
    recentlyAiredShows: recentlyAiredShows.slice(0, 24),
    popularShows: popularShows.slice(0, 24),
    allShows,
  };
}

export async function getShowDetail(id: string, userId: string) {
  const db = await getDb();
  const show = await db
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
  if (!show) return null;

  const seasonRows = await db
    .selectFrom("media_item")
    .selectAll()
    .where("parent_id", "=", id)
    .where("kind", "=", "season")
    .orderBy("season_number", "asc")
    .orderBy("title", "asc")
    .execute();
  const seasonIds = seasonRows.map((season) => season.id);

  const episodeRows =
    seasonIds.length === 0
      ? []
      : await db
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

  const episodeIds = episodeRows.map((episode) => episode.id);
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
    .limit(16)
    .execute();
  const progressRows =
    episodeIds.length === 0
      ? []
      : await db
          .selectFrom("watch_progress")
          .select(["media_item_id", "media_file_id", "position_seconds", "duration_seconds", "completed", "updated_at"])
          .where("user_id", "=", userId)
          .where("media_item_id", "in", episodeIds)
          .orderBy("updated_at", "desc")
          .execute();
  const progress = summarizeMovieProgress(progressRows);

  const episodesBySeason = new Map<string, typeof episodeRows>();
  for (const episode of episodeRows) {
    const seasonEpisodes = episodesBySeason.get(episode.parent_id ?? "") ?? [];
    seasonEpisodes.push(episode);
    episodesBySeason.set(episode.parent_id ?? "", seasonEpisodes);
  }

  return {
    show: {
      id: show.id,
      title: show.title,
      year: show.year,
      overview: show.overview,
      posterUrl: tmdbImageUrl(show.poster_path),
      backdropUrl: tmdbImageUrl(show.backdrop_path, "w1280"),
      releaseDate: show.release_date,
      status: show.status,
      voteAverage: show.vote_average,
      popularity: show.popularity,
      genres: genres.map((genre) => genre.name),
    },
    cast: cast.map((credit) => ({
      provider: credit.provider,
      providerId: credit.provider_id,
      name: credit.name,
      character: credit.character_name,
      profilePath: credit.profile_path,
    })),
    seasons: seasonRows.map((season) => ({
      id: season.id,
      title: season.title,
      seasonNumber: season.season_number,
      posterUrl: tmdbImageUrl(season.poster_path),
      episodes: (episodesBySeason.get(season.id) ?? []).map((episode) => {
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
      }),
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

export async function getWatchItemDetail(id: string, userId: string) {
  const db = await getDb();
  const item = await db
    .selectFrom("media_item")
    .select(["id", "kind", "title", "parent_id", "season_number", "episode_number"])
    .where("id", "=", id)
    .where("kind", "in", ["movie", "episode"])
    .executeTakeFirst();
  if (!item) return null;

  const files = await db
    .selectFrom("media_file")
    .select("id")
    .where("media_item_id", "=", id)
    .where(accessibleLibrarySql(userId))
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

  if (item.kind === "movie") {
    return {
      item: {
        id: item.id,
        kind: item.kind,
        title: item.title,
        backHref: `/movies/${item.id}`,
      },
      progress,
    };
  }

  let title = item.title;
  let backHref = `/episodes/${item.id}`;
  if (item.parent_id) {
    const season = await db
      .selectFrom("media_item")
      .select(["id", "parent_id"])
      .where("id", "=", item.parent_id)
      .where("kind", "=", "season")
      .executeTakeFirst();
    if (season?.parent_id) {
      const show = await db
        .selectFrom("media_item")
        .select(["id", "title"])
        .where("id", "=", season.parent_id)
        .where("kind", "=", "show")
        .executeTakeFirst();
      if (show) {
        const seasonNumber = item.season_number === null ? "?" : String(item.season_number).padStart(2, "0");
        const episodeNumber = item.episode_number === null ? "?" : String(item.episode_number).padStart(2, "0");
        title = `${show.title} - S${seasonNumber}E${episodeNumber} - ${item.title}`;
        backHref = `/shows/${show.id}`;
      }
    }
  }

  return {
    item: {
      id: item.id,
      kind: item.kind,
      title,
      backHref,
    },
    progress,
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

export async function getPersonDetail(provider: string, providerId: string, userId: string) {
  const db = await getDb();
  const person = await db
    .selectFrom("media_item_credit")
    .select(["provider", "provider_id", "name", "original_name", "profile_path"])
    .where("provider", "=", provider)
    .where("provider_id", "=", providerId)
    .orderBy("profile_path", "desc")
    .executeTakeFirst();

  if (!person) return null;

  const rows = await db
    .selectFrom("media_item_credit")
    .innerJoin("media_item", "media_item.id", "media_item_credit.media_item_id")
    .innerJoin("media_file", "media_file.media_item_id", "media_item.id")
    .select([
      "media_item.id",
      "media_item.title",
      "media_item.sort_title",
      "media_item.year",
      "media_item.poster_path",
      "media_item.release_date",
      "media_item.popularity",
      "media_item.vote_average",
      "media_item_credit.character_name as character",
      sql<number>`count(distinct media_file.id)`.as("file_count"),
      sql<string | null>`max(media_file.created_at)`.as("latest_file_created_at"),
    ])
    .where("media_item.kind", "=", "movie")
    .where("media_item_credit.credit_type", "=", "cast")
    .where("media_item_credit.provider", "=", provider)
    .where("media_item_credit.provider_id", "=", providerId)
    .where(accessibleLibrarySql(userId))
    .groupBy("media_item.id")
    .groupBy("media_item_credit.character_name")
    .orderBy("media_item.release_date", "desc")
    .orderBy("media_item.sort_title", "asc")
    .execute();
  const showRows = await db
    .selectFrom("media_item_credit")
    .innerJoin("media_item as show", "show.id", "media_item_credit.media_item_id")
    .innerJoin("media_item as season", "season.parent_id", "show.id")
    .innerJoin("media_item as episode", "episode.parent_id", "season.id")
    .innerJoin("media_file", "media_file.media_item_id", "episode.id")
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
      "media_item_credit.character_name as character",
      sql<number>`count(distinct episode.id)`.as("episode_count"),
      sql<number>`count(distinct season.id)`.as("season_count"),
      sql<string | null>`max(media_file.created_at)`.as("latest_file_created_at"),
      sql<string | null>`max(episode.release_date)`.as("latest_episode_release_date"),
    ])
    .where("show.kind", "=", "show")
    .where("season.kind", "=", "season")
    .where("episode.kind", "=", "episode")
    .where("media_item_credit.credit_type", "=", "cast")
    .where("media_item_credit.provider", "=", provider)
    .where("media_item_credit.provider_id", "=", providerId)
    .where(accessibleLibrarySql(userId))
    .groupBy("show.id")
    .groupBy("media_item_credit.character_name")
    .orderBy(sql<string | null>`max(episode.release_date)`, "desc")
    .orderBy("show.sort_title", "asc")
    .execute();

  const movieIds = rows.map((movie) => movie.id);
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

  return {
    person: {
      provider: person.provider,
      providerId: person.provider_id,
      name: person.name,
      originalName: person.original_name,
      profileUrl: tmdbImageUrl(person.profile_path, "w342"),
    },
    movies: rows.map((movie) => publicMovieSummary(movie, progress)),
    shows: showRows.map((show) => ({
      ...publicShowSummary(show),
      character: show.character,
    })),
  };
}

export async function getMediaFile(id: string, userId: string) {
  const db = await getDb();
  return db
    .selectFrom("media_file")
    .innerJoin("media_item", "media_item.id", "media_file.media_item_id")
    .innerJoin("library", "library.id", "media_file.library_id")
    .select([
      "media_file.id",
      "media_file.library_id",
      "media_file.media_item_id",
      "media_file.path",
      "media_file.basename",
      "media_file.extension",
      "media_file.size_bytes",
      "media_file.duration_seconds",
      "media_file.video_codec",
      "media_file.audio_codec",
      "media_file.container",
      "library.source",
      "library.config_json",
      "media_item.title",
    ])
    .where("media_file.id", "=", id)
    .where("media_item.kind", "in", ["movie", "episode"])
    .where(accessibleLibrarySql(userId))
    .executeTakeFirst();
}

export async function getFirstPlayableFile(mediaItemId: string, userId: string) {
  const db = await getDb();
  return db
    .selectFrom("media_file")
    .innerJoin("media_item", "media_item.id", "media_file.media_item_id")
    .innerJoin("library", "library.id", "media_file.library_id")
    .select([
      "media_file.id",
      "media_file.media_item_id",
      "media_file.basename",
      "media_file.extension",
      "media_file.size_bytes",
      "media_file.duration_seconds",
      "media_file.video_codec",
      "media_file.audio_codec",
      "media_file.container",
      "library.source",
    ])
    .where("media_file.media_item_id", "=", mediaItemId)
    .where("media_item.kind", "in", ["movie", "episode"])
    .where(accessibleLibrarySql(userId))
    .orderBy("media_file.basename", "asc")
    .executeTakeFirst();
}

export async function getPlayableFile(mediaItemId: string, mediaFileId: string, userId: string) {
  const db = await getDb();
  return db
    .selectFrom("media_file")
    .innerJoin("media_item", "media_item.id", "media_file.media_item_id")
    .innerJoin("library", "library.id", "media_file.library_id")
    .select([
      "media_file.id",
      "media_file.media_item_id",
      "media_file.basename",
      "media_file.extension",
      "media_file.size_bytes",
      "media_file.duration_seconds",
      "media_file.video_codec",
      "media_file.audio_codec",
      "media_file.container",
      "library.source",
    ])
    .where("media_file.media_item_id", "=", mediaItemId)
    .where("media_file.id", "=", mediaFileId)
    .where("media_item.kind", "in", ["movie", "episode"])
    .where(accessibleLibrarySql(userId))
    .executeTakeFirst();
}
