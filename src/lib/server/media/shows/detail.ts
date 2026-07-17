import { sql } from "kysely";
import { resolveShowSeason } from "$lib/media/seasons";
import { tmdbImageUrl } from "$lib/media/images";
import { getDb } from "../../db";
import { TV_SHOW_CREATOR_JOBS } from "../../metadata/tv";
import { accessibleLibrarySql } from "../catalog";
import { publicMovieSummary, summarizeMovieProgress } from "../progress";
import { tvEpisodeProgress } from "./episodes";

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
      year: season.year,
      voteAverage: season.vote_average,
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
      voteCount: episode.vote_count,
    },
    files,
    progress,
  };
}
