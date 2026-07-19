import { tmdbImageUrl } from "$lib/media/images";
import { getDb } from "../../db";
import { accessibleLibrarySql } from "../catalog";
import { isInWatchlist } from "../watchlist";

const MOVIE_DETAIL_SELECT = [
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
] as const;

type MovieCastCredit = {
  provider: string | null;
  providerId: string | null;
  name: string;
  character: string | null;
  profilePath: string | null;
};

type MovieOverviewMetadata = {
  genres: string[];
  directors: string[];
  writers: string[];
  keywords: string[];
  productionCompanies: string[];
};

async function fetchMovieRecord(id: string) {
  const db = await getDb();
  return db
    .selectFrom("media_item")
    .select(MOVIE_DETAIL_SELECT)
    .where("id", "=", id)
    .where("kind", "=", "movie")
    .executeTakeFirst();
}

async function fetchMovieFiles(id: string, userId: string) {
  const db = await getDb();
  return db
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
}

async function fetchMovieProgress(id: string, userId: string) {
  const db = await getDb();
  return db
    .selectFrom("watch_progress")
    .select(["media_file_id", "position_seconds", "duration_seconds", "completed", "updated_at"])
    .where("media_item_id", "=", id)
    .where("user_id", "=", userId)
    .execute();
}

async function fetchAccessibleMovieDetail(id: string, userId: string) {
  const movieRow = await fetchMovieRecord(id);
  if (!movieRow) return null;

  const files = await fetchMovieFiles(id, userId);
  if (files.length === 0) return null;

  const { poster_path: posterPath, backdrop_path: backdropPath, ...movie } = movieRow;
  const [progress, inWatchlist] = await Promise.all([fetchMovieProgress(id, userId), isInWatchlist(userId, id)]);

  return {
    movie,
    posterPath,
    backdropPath,
    files,
    progress,
    inWatchlist,
  };
}

async function fetchMovieOverviewMetadata(movieId: string): Promise<MovieOverviewMetadata> {
  const db = await getDb();
  const [genres, directors, writers, keywords, productionCompanies] = await Promise.all([
    db
      .selectFrom("media_item_genre")
      .select(["name"])
      .where("media_item_id", "=", movieId)
      .orderBy("position", "asc")
      .execute(),
    db
      .selectFrom("media_item_credit")
      .select(["name"])
      .where("media_item_id", "=", movieId)
      .where("credit_type", "=", "crew")
      .where("job", "=", "Director")
      .orderBy("credit_order", "asc")
      .execute(),
    db
      .selectFrom("media_item_credit")
      .select(["name"])
      .where("media_item_id", "=", movieId)
      .where("credit_type", "=", "crew")
      .where("job", "in", ["Writer", "Screenplay", "Story"])
      .orderBy("credit_order", "asc")
      .limit(4)
      .execute(),
    db
      .selectFrom("media_item_keyword")
      .select(["name"])
      .where("media_item_id", "=", movieId)
      .orderBy("name", "asc")
      .limit(12)
      .execute(),
    db
      .selectFrom("media_item_production_company")
      .select(["name"])
      .where("media_item_id", "=", movieId)
      .orderBy("name", "asc")
      .limit(6)
      .execute(),
  ]);

  return {
    genres: genres.map((genre) => genre.name),
    directors: directors.map((credit) => credit.name),
    writers: writers.map((credit) => credit.name),
    keywords: keywords.map((keyword) => keyword.name),
    productionCompanies: productionCompanies.map((company) => company.name),
  };
}

async function fetchMovieCast(movieId: string): Promise<MovieCastCredit[]> {
  const db = await getDb();
  const cast = await db
    .selectFrom("media_item_credit")
    .select(["provider", "provider_id", "name", "character_name", "profile_path", "credit_order"])
    .where("media_item_id", "=", movieId)
    .where("credit_type", "=", "cast")
    .orderBy("credit_order", "asc")
    .limit(12)
    .execute();

  return cast.map((credit) => ({
    provider: credit.provider,
    providerId: credit.provider_id,
    name: credit.name,
    character: credit.character_name,
    profilePath: credit.profile_path,
  }));
}

function buildMovieImageUrls(posterPath: string | null, backdropPath: string | null) {
  return {
    posterUrl: tmdbImageUrl(posterPath, "w500"),
    backdropUrl: tmdbImageUrl(backdropPath, "w1280"),
  };
}

export async function getMovieOverview(id: string, userId: string) {
  const detail = await fetchAccessibleMovieDetail(id, userId);
  if (!detail) return null;

  const metadata = await fetchMovieOverviewMetadata(id);

  return {
    movie: detail.movie,
    files: detail.files,
    progress: detail.progress,
    inWatchlist: detail.inWatchlist,
    genres: metadata.genres,
    directors: metadata.directors,
    writers: metadata.writers,
    keywords: metadata.keywords,
    productionCompanies: metadata.productionCompanies,
    ...buildMovieImageUrls(detail.posterPath, detail.backdropPath),
  };
}

export async function getMovieCredits(id: string, userId: string) {
  const detail = await fetchAccessibleMovieDetail(id, userId);
  if (!detail) return null;

  const [cast, metadata] = await Promise.all([fetchMovieCast(id), fetchMovieOverviewMetadata(id)]);

  return {
    show: {
      id: detail.movie.id,
      title: detail.movie.title,
    },
    cast,
    directors: metadata.directors,
    writers: metadata.writers,
  };
}

export async function getMovieDetail(id: string, userId: string) {
  const overview = await getMovieOverview(id, userId);
  if (!overview) return null;

  return {
    ...overview,
    cast: await fetchMovieCast(id),
  };
}
