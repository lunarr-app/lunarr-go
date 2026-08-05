import type { Kysely } from "kysely";
import type { Database } from "../db/schema";
import type {
  MatchedMovieMetadata,
  MatchedTvEpisodeMetadata,
  MatchedTvSeasonMetadata,
  MatchedTvShowMetadata,
} from "./tmdb";

type MediaMetadataRelations = Pick<
  MatchedMovieMetadata,
  | "provider"
  | "genres"
  | "cast"
  | "crew"
  | "videos"
  | "keywords"
  | "productionCompanies"
  | "productionCountries"
  | "spokenLanguages"
>;

export function movieMetadataValues(metadata: MatchedMovieMetadata, updatedAt: string) {
  return {
    title: metadata.title,
    year: metadata.year,
    original_title: metadata.originalTitle,
    overview: metadata.overview,
    tagline: metadata.tagline,
    runtime_seconds: metadata.runtimeSeconds,
    poster_path: metadata.posterPath,
    backdrop_path: metadata.backdropPath,
    release_date: metadata.releaseDate,
    status: metadata.status,
    homepage: metadata.homepage,
    original_language: metadata.originalLanguage,
    imdb_id: metadata.imdbId,
    budget: metadata.budget,
    revenue: metadata.revenue,
    vote_count: metadata.voteCount,
    certification: metadata.certification,
    trailer_site: metadata.trailer?.site ?? null,
    trailer_key: metadata.trailer?.key ?? null,
    trailer_name: metadata.trailer?.name ?? null,
    collection_provider_id: metadata.collection?.providerId ?? null,
    collection_name: metadata.collection?.name ?? null,
    collection_poster_path: metadata.collection?.posterPath ?? null,
    collection_backdrop_path: metadata.collection?.backdropPath ?? null,
    provider: metadata.provider,
    provider_id: metadata.providerId,
    popularity: metadata.popularity,
    vote_average: metadata.voteAverage,
    updated_at: updatedAt,
  };
}

export function emptyMovieMetadataValues() {
  return {
    original_title: null,
    overview: null,
    tagline: null,
    runtime_seconds: null,
    poster_path: null,
    backdrop_path: null,
    status: null,
    homepage: null,
    original_language: null,
    imdb_id: null,
    budget: null,
    revenue: null,
    vote_count: null,
    certification: null,
    trailer_site: null,
    trailer_key: null,
    trailer_name: null,
    collection_provider_id: null,
    collection_name: null,
    collection_poster_path: null,
    collection_backdrop_path: null,
    provider: null,
    provider_id: null,
    popularity: null,
    vote_average: null,
  };
}

export function tvShowMetadataValues(metadata: MatchedTvShowMetadata, updatedAt: string) {
  return {
    title: metadata.title,
    year: metadata.year,
    original_title: metadata.originalTitle,
    overview: metadata.overview,
    tagline: metadata.tagline,
    runtime_seconds: null,
    poster_path: metadata.posterPath,
    backdrop_path: metadata.backdropPath,
    release_date: metadata.firstAirDate,
    status: metadata.status,
    homepage: metadata.homepage,
    original_language: metadata.originalLanguage,
    imdb_id: metadata.imdbId,
    budget: null,
    revenue: null,
    vote_count: metadata.voteCount,
    certification: metadata.certification,
    trailer_site: metadata.trailer?.site ?? null,
    trailer_key: metadata.trailer?.key ?? null,
    trailer_name: metadata.trailer?.name ?? null,
    collection_provider_id: null,
    collection_name: null,
    collection_poster_path: null,
    collection_backdrop_path: null,
    provider: metadata.provider,
    provider_id: metadata.providerId,
    popularity: metadata.popularity,
    vote_average: metadata.voteAverage,
    updated_at: updatedAt,
  };
}

export function tvSeasonMetadataValues(metadata: MatchedTvSeasonMetadata, updatedAt: string) {
  return {
    title: metadata.title,
    year: metadata.airDate ? Number(metadata.airDate.slice(0, 4)) || null : null,
    season_number: metadata.seasonNumber,
    episode_number: null,
    original_title: null,
    overview: metadata.overview,
    tagline: null,
    runtime_seconds: null,
    poster_path: metadata.posterPath,
    backdrop_path: null,
    release_date: metadata.airDate,
    status: null,
    homepage: null,
    original_language: null,
    imdb_id: null,
    budget: null,
    revenue: null,
    vote_count: null,
    certification: null,
    trailer_site: null,
    trailer_key: null,
    trailer_name: null,
    collection_provider_id: null,
    collection_name: null,
    collection_poster_path: null,
    collection_backdrop_path: null,
    provider: metadata.provider,
    provider_id: metadata.providerId,
    popularity: null,
    vote_average: metadata.voteAverage,
    updated_at: updatedAt,
  };
}

export function tvEpisodeMetadataValues(metadata: MatchedTvEpisodeMetadata, updatedAt: string) {
  return {
    title: metadata.title,
    year: metadata.airDate ? Number(metadata.airDate.slice(0, 4)) || null : null,
    season_number: metadata.seasonNumber,
    episode_number: metadata.episodeNumber,
    original_title: null,
    overview: metadata.overview,
    tagline: null,
    runtime_seconds: metadata.runtimeSeconds,
    poster_path: metadata.stillPath,
    backdrop_path: null,
    release_date: metadata.airDate,
    status: null,
    homepage: null,
    original_language: null,
    imdb_id: null,
    budget: null,
    revenue: null,
    vote_count: metadata.voteCount,
    certification: null,
    trailer_site: null,
    trailer_key: null,
    trailer_name: null,
    collection_provider_id: null,
    collection_name: null,
    collection_poster_path: null,
    collection_backdrop_path: null,
    provider: metadata.provider,
    provider_id: metadata.providerId,
    popularity: null,
    vote_average: metadata.voteAverage,
    updated_at: updatedAt,
  };
}

async function clearMovieMetadataRelations(db: Kysely<Database>, mediaItemId: string) {
  await db.deleteFrom("media_item_genre").where("media_item_id", "=", mediaItemId).execute();
  await db.deleteFrom("media_item_credit").where("media_item_id", "=", mediaItemId).execute();
  await db.deleteFrom("media_item_video").where("media_item_id", "=", mediaItemId).execute();
  await db.deleteFrom("media_item_keyword").where("media_item_id", "=", mediaItemId).execute();
  await db.deleteFrom("media_item_production_company").where("media_item_id", "=", mediaItemId).execute();
  await db.deleteFrom("media_item_production_country").where("media_item_id", "=", mediaItemId).execute();
  await db.deleteFrom("media_item_spoken_language").where("media_item_id", "=", mediaItemId).execute();
}

export async function syncMediaMetadataRelations(
  db: Kysely<Database>,
  mediaItemId: string,
  metadata: MediaMetadataRelations,
) {
  await clearMovieMetadataRelations(db, mediaItemId);

  const genres = metadata.genres ?? [];
  const cast = metadata.cast ?? [];
  const crew = metadata.crew ?? [];
  const videos = metadata.videos ?? [];
  const keywords = metadata.keywords ?? [];
  const productionCompanies = metadata.productionCompanies ?? [];
  const productionCountries = metadata.productionCountries ?? [];
  const spokenLanguages = metadata.spokenLanguages ?? [];

  if (genres.length) {
    await db
      .insertInto("media_item_genre")
      .values(
        genres.map((genre, index) => ({
          media_item_id: mediaItemId,
          provider: metadata.provider,
          provider_id: genre.providerId,
          name: genre.name,
          position: index,
        })),
      )
      .execute();
  }

  const credits = [
    ...cast.map((credit) => ({
      media_item_id: mediaItemId,
      credit_type: "cast" as const,
      provider: metadata.provider,
      provider_id: credit.providerId,
      credit_id: credit.creditId || `cast-${credit.order}-${credit.providerId}`,
      name: credit.name,
      original_name: credit.originalName,
      profile_path: credit.profilePath,
      credit_order: credit.order,
      department: null,
      job: null,
      character_name: credit.character,
    })),
    ...crew.map((credit) => ({
      media_item_id: mediaItemId,
      credit_type: "crew" as const,
      provider: metadata.provider,
      provider_id: credit.providerId,
      credit_id: credit.creditId || `crew-${credit.order}-${credit.providerId}`,
      name: credit.name,
      original_name: credit.originalName,
      profile_path: credit.profilePath,
      credit_order: credit.order,
      department: credit.department,
      job: credit.job,
      character_name: null,
    })),
  ];

  if (credits.length) {
    await db.insertInto("media_item_credit").values(credits).execute();
  }

  if (videos.length) {
    await db
      .insertInto("media_item_video")
      .values(
        videos.map((video) => ({
          media_item_id: mediaItemId,
          provider: metadata.provider,
          provider_id: video.providerId,
          name: video.name,
          site: video.site,
          video_key: video.key,
          video_type: video.type,
          official: video.official ? 1 : 0,
          published_at: video.publishedAt,
        })),
      )
      .execute();
  }

  if (keywords.length) {
    await db
      .insertInto("media_item_keyword")
      .values(
        keywords.map((keyword) => ({
          media_item_id: mediaItemId,
          provider: metadata.provider,
          provider_id: keyword.providerId,
          name: keyword.name,
        })),
      )
      .execute();
  }

  if (productionCompanies.length) {
    await db
      .insertInto("media_item_production_company")
      .values(
        productionCompanies.map((company) => ({
          media_item_id: mediaItemId,
          provider: metadata.provider,
          provider_id: company.providerId,
          name: company.name,
          logo_path: company.logoPath,
          origin_country: company.originCountry,
        })),
      )
      .execute();
  }

  if (productionCountries.length) {
    await db
      .insertInto("media_item_production_country")
      .values(
        productionCountries.map((country) => ({
          media_item_id: mediaItemId,
          iso_3166_1: country.iso31661,
          name: country.name,
        })),
      )
      .execute();
  }

  if (spokenLanguages.length) {
    await db
      .insertInto("media_item_spoken_language")
      .values(
        spokenLanguages.map((language) => ({
          media_item_id: mediaItemId,
          iso_639_1: language.iso6391,
          english_name: language.englishName,
          name: language.name,
        })),
      )
      .execute();
  }
}

export async function moveWatchlistEntries(db: Kysely<Database>, oldMediaItemId: string, newMediaItemId: string) {
  if (oldMediaItemId === newMediaItemId) return;

  const rows = await db.selectFrom("watchlist").select("user_id").where("media_item_id", "=", oldMediaItemId).execute();

  for (const row of rows) {
    const existing = await db
      .selectFrom("watchlist")
      .select("user_id")
      .where("user_id", "=", row.user_id)
      .where("media_item_id", "=", newMediaItemId)
      .executeTakeFirst();

    if (existing) {
      await db
        .deleteFrom("watchlist")
        .where("user_id", "=", row.user_id)
        .where("media_item_id", "=", oldMediaItemId)
        .execute();
    } else {
      await db
        .updateTable("watchlist")
        .set({ media_item_id: newMediaItemId })
        .where("user_id", "=", row.user_id)
        .where("media_item_id", "=", oldMediaItemId)
        .execute();
    }
  }
}

export async function moveMediaShares(db: Kysely<Database>, oldMediaItemId: string, newMediaItemId: string) {
  if (oldMediaItemId === newMediaItemId) return;

  await db
    .updateTable("media_share")
    .set({ media_item_id: newMediaItemId })
    .where("media_item_id", "=", oldMediaItemId)
    .execute();
}

export async function moveWatchProgressForFiles(
  db: Kysely<Database>,
  mediaFileIds: string[],
  oldMediaItemId: string,
  newMediaItemId: string,
) {
  if (oldMediaItemId === newMediaItemId || mediaFileIds.length === 0) return;

  for (const mediaFileId of mediaFileIds) {
    const progressRows = await db
      .selectFrom("watch_progress")
      .selectAll()
      .where("media_file_id", "=", mediaFileId)
      .where("media_item_id", "=", oldMediaItemId)
      .execute();

    for (const progress of progressRows) {
      const existingProgress = await db
        .selectFrom("watch_progress")
        .selectAll()
        .where("user_id", "=", progress.user_id)
        .where("media_item_id", "=", newMediaItemId)
        .where("media_file_id", "=", progress.media_file_id)
        .executeTakeFirst();

      if (existingProgress) {
        if (new Date(progress.updated_at).getTime() >= new Date(existingProgress.updated_at).getTime()) {
          await db
            .updateTable("watch_progress")
            .set({
              position_seconds: progress.position_seconds,
              duration_seconds: progress.duration_seconds,
              completed: progress.completed,
              updated_at: progress.updated_at,
            })
            .where("user_id", "=", progress.user_id)
            .where("media_item_id", "=", newMediaItemId)
            .where("media_file_id", "=", progress.media_file_id)
            .execute();
        }

        await db
          .deleteFrom("watch_progress")
          .where("user_id", "=", progress.user_id)
          .where("media_item_id", "=", oldMediaItemId)
          .where("media_file_id", "=", progress.media_file_id)
          .execute();
      } else {
        await db
          .updateTable("watch_progress")
          .set({ media_item_id: newMediaItemId })
          .where("user_id", "=", progress.user_id)
          .where("media_item_id", "=", oldMediaItemId)
          .where("media_file_id", "=", progress.media_file_id)
          .execute();
      }
    }
  }
}

export async function remapShareSeasonId(db: Kysely<Database>, oldSeasonId: string, newSeasonId: string) {
  if (oldSeasonId === newSeasonId) return;

  const shares = await db
    .selectFrom("media_share")
    .select(["id", "season_ids"])
    .where("season_ids", "is not", null)
    .execute();

  for (const share of shares) {
    let seasonIds: unknown;
    try {
      seasonIds = JSON.parse(share.season_ids as string);
    } catch {
      continue;
    }
    if (!Array.isArray(seasonIds) || !seasonIds.includes(oldSeasonId)) continue;

    const remapped = [...new Set(seasonIds.map((id) => (id === oldSeasonId ? newSeasonId : id)))].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    await db
      .updateTable("media_share")
      .set({ season_ids: remapped.length ? JSON.stringify(remapped) : null })
      .where("id", "=", share.id)
      .execute();
  }
}
