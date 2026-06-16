import { getSetting } from "../settings";
import { PUBLIC_TMDB_ACCESS_TOKEN } from "./public-token";

type TmdbSearchResult = {
  id: number;
  adult?: boolean;
  title?: string;
  original_title?: string;
  original_language?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
};

type TmdbTvSearchResult = {
  id: number;
  adult?: boolean;
  name?: string;
  original_name?: string;
  original_language?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
};

type TmdbMovieDetails = TmdbSearchResult & {
  budget?: number | null;
  homepage?: string | null;
  imdb_id?: string | null;
  runtime?: number | null;
  revenue?: number | null;
  status?: string | null;
  tagline?: string | null;
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
  } | null;
  genres?: Array<{ id: number; name: string }>;
  production_companies?: Array<{
    id: number;
    name: string;
    logo_path?: string | null;
    origin_country?: string | null;
  }>;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  spoken_languages?: Array<{
    iso_639_1: string;
    english_name?: string;
    name: string;
  }>;
  credits?: {
    cast?: Array<{
      id: number;
      credit_id?: string;
      name: string;
      original_name?: string;
      character?: string;
      order?: number;
      profile_path?: string | null;
    }>;
    crew?: Array<{
      id: number;
      credit_id?: string;
      name: string;
      original_name?: string;
      department?: string;
      job?: string;
      profile_path?: string | null;
    }>;
  };
  videos?: {
    results?: Array<{
      id: string;
      name: string;
      key: string;
      site: string;
      type?: string;
      official?: boolean;
      published_at?: string;
    }>;
  };
  keywords?: {
    keywords?: Array<{ id: number; name: string }>;
  };
  release_dates?: {
    results?: Array<{
      iso_3166_1: string;
      release_dates?: Array<{ certification?: string; type?: number }>;
    }>;
  };
};

type TmdbTvDetails = TmdbTvSearchResult & {
  homepage?: string | null;
  in_production?: boolean | null;
  last_air_date?: string | null;
  number_of_episodes?: number | null;
  number_of_seasons?: number | null;
  status?: string | null;
  tagline?: string | null;
  type?: string | null;
  genres?: Array<{ id: number; name: string }>;
  production_companies?: Array<{
    id: number;
    name: string;
    logo_path?: string | null;
    origin_country?: string | null;
  }>;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  spoken_languages?: Array<{
    iso_639_1: string;
    english_name?: string;
    name: string;
  }>;
  created_by?: Array<{
    id: number;
    credit_id?: string;
    name: string;
    original_name?: string;
    gender?: number;
    profile_path?: string | null;
  }>;
  aggregate_credits?: {
    cast?: Array<{
      id: number;
      credit_id?: string;
      name: string;
      original_name?: string;
      roles?: Array<{
        credit_id?: string;
        character?: string;
        episode_count?: number;
      }>;
      order?: number;
      profile_path?: string | null;
    }>;
    crew?: Array<{
      id: number;
      credit_id?: string;
      name: string;
      original_name?: string;
      department?: string;
      jobs?: Array<{
        credit_id?: string;
        job?: string;
        episode_count?: number;
      }>;
      profile_path?: string | null;
    }>;
  };
  credits?: TmdbMovieDetails["credits"];
  videos?: TmdbMovieDetails["videos"];
  keywords?: {
    results?: Array<{ id: number; name: string }>;
  };
  content_ratings?: {
    results?: Array<{ iso_3166_1: string; rating?: string }>;
  };
  external_ids?: {
    imdb_id?: string | null;
  };
};

type TmdbTvSeasonDetails = {
  id: number;
  name?: string;
  overview?: string | null;
  air_date?: string | null;
  poster_path?: string | null;
  season_number?: number;
  vote_average?: number | null;
  episodes?: Array<{
    id: number;
    name?: string;
    overview?: string | null;
    air_date?: string | null;
    episode_number?: number;
    season_number?: number;
    runtime?: number | null;
    still_path?: string | null;
    vote_average?: number | null;
    vote_count?: number | null;
  }>;
};

type TmdbCredentials = {
  token?: string;
  apiKey?: string;
};

type TmdbFetch = typeof fetch;

export type MatchedMovieMetadata = {
  provider: "tmdb";
  providerId: string;
  title: string;
  year: number | null;
  overview: string | null;
  runtimeSeconds: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  popularity: number | null;
  voteAverage: number | null;
  voteCount?: number | null;
  originalTitle?: string | null;
  tagline?: string | null;
  status?: string | null;
  homepage?: string | null;
  originalLanguage?: string | null;
  imdbId?: string | null;
  budget?: number | null;
  revenue?: number | null;
  certification?: string | null;
  collection?: {
    providerId: string;
    name: string;
    posterPath: string | null;
    backdropPath: string | null;
  } | null;
  trailer?: {
    site: string;
    key: string;
    name: string;
  } | null;
  genres?: Array<{ providerId: string; name: string }>;
  cast?: Array<{
    providerId: string;
    creditId: string;
    name: string;
    originalName: string | null;
    character: string | null;
    order: number;
    profilePath: string | null;
  }>;
  crew?: Array<{
    providerId: string;
    creditId: string;
    name: string;
    originalName: string | null;
    department: string | null;
    job: string | null;
    order: number;
    profilePath: string | null;
  }>;
  videos?: Array<{
    providerId: string;
    name: string;
    site: string;
    key: string;
    type: string | null;
    official: boolean;
    publishedAt: string | null;
  }>;
  keywords?: Array<{ providerId: string; name: string }>;
  productionCompanies?: Array<{
    providerId: string;
    name: string;
    logoPath: string | null;
    originCountry: string | null;
  }>;
  productionCountries?: Array<{ iso31661: string; name: string }>;
  spokenLanguages?: Array<{
    iso6391: string;
    englishName: string | null;
    name: string;
  }>;
};

type CommonMediaMetadataRelations = {
  provider: "tmdb";
  genres?: Array<{ providerId: string; name: string }>;
  cast?: MatchedMovieMetadata["cast"];
  crew?: MatchedMovieMetadata["crew"];
  videos?: MatchedMovieMetadata["videos"];
  keywords?: Array<{ providerId: string; name: string }>;
  productionCompanies?: MatchedMovieMetadata["productionCompanies"];
  productionCountries?: MatchedMovieMetadata["productionCountries"];
  spokenLanguages?: MatchedMovieMetadata["spokenLanguages"];
};

export type MatchedTvShowMetadata = CommonMediaMetadataRelations & {
  provider: "tmdb";
  providerId: string;
  title: string;
  year: number | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  firstAirDate: string | null;
  popularity: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  originalTitle: string | null;
  tagline: string | null;
  status: string | null;
  homepage: string | null;
  originalLanguage: string | null;
  imdbId: string | null;
  certification: string | null;
  trailer: {
    site: string;
    key: string;
    name: string;
  } | null;
};

export type MatchedTvSeasonMetadata = {
  provider: "tmdb";
  providerId: string;
  title: string;
  seasonNumber: number;
  overview: string | null;
  posterPath: string | null;
  airDate: string | null;
  voteAverage: number | null;
};

export type MatchedTvEpisodeMetadata = {
  provider: "tmdb";
  providerId: string;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  overview: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtimeSeconds: number | null;
  voteAverage: number | null;
  voteCount: number | null;
};

export type MatchedTvSeasonLookup = {
  show: MatchedTvShowMetadata;
  season: MatchedTvSeasonMetadata;
  episodes: MatchedTvEpisodeMetadata[];
};

async function credentials(override?: TmdbCredentials) {
  if (override) {
    return {
      token: override.token ?? "",
      apiKey: override.apiKey ?? "",
    };
  }

  const settingsToken = await getSetting("tmdb_access_token");
  const settingsKey = await getSetting("tmdb_api_key");
  const token = settingsToken || "";
  const apiKey = settingsKey || "";

  return {
    token: token || (apiKey ? "" : PUBLIC_TMDB_ACCESS_TOKEN),
    apiKey,
  };
}

export async function tmdbCredentialsConfigured(override?: TmdbCredentials) {
  const { token, apiKey } = await credentials(override);
  return Boolean(token || apiKey);
}

async function tmdbFetch<T>(url: URL, override?: TmdbCredentials, fetcher: TmdbFetch = fetch) {
  const { token, apiKey } = await credentials(override);
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  } else if (token) {
    headers.authorization = `Bearer ${token}`;
  } else {
    return null;
  }

  const response = await fetcher(url, { headers });
  if (!response.ok) {
    throw new Error(`TMDb request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

function extractYear(releaseDate: string | null | undefined) {
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) : NaN;
  return Number.isFinite(year) ? year : null;
}

function normalizeTitle(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u2018\u2019\u201A\u201B\u2032]/g, "")
    .replace(/\bvolume\b/g, "vol")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function wordSequenceEndsWith(haystackWords: string[], needleWords: string[]) {
  if (needleWords.length === 0 || needleWords.length > haystackWords.length) return false;
  const offset = haystackWords.length - needleWords.length;
  return needleWords.every((word, index) => haystackWords[offset + index] === word);
}

function canUsePhraseMatch(needle: string) {
  const words = needle.split(" ").filter(Boolean);
  return words.length >= 2 || needle.length >= 10;
}

function exactTitleMatches(queryTitle: string, resultTitle: string) {
  const query = normalizeTitle(queryTitle);
  const result = normalizeTitle(resultTitle);
  return Boolean(query && result && query === result);
}

function phraseTitleMatches(queryTitle: string, resultTitle: string) {
  const query = normalizeTitle(queryTitle);
  if (!canUsePhraseMatch(query)) return false;

  const queryWords = query.split(" ").filter(Boolean);
  const candidateWords = normalizeTitle(resultTitle).split(" ").filter(Boolean);
  return wordSequenceEndsWith(candidateWords, queryWords) || wordSequenceEndsWith(queryWords, candidateWords);
}

function titlePhraseMatches(result: TmdbSearchResult, title: string) {
  return phraseTitleMatches(title, result.title ?? "") || phraseTitleMatches(title, result.original_title ?? "");
}

function titleMatches(result: TmdbSearchResult, title: string) {
  return (
    exactTitleMatches(title, result.title ?? "") ||
    exactTitleMatches(title, result.original_title ?? "") ||
    titlePhraseMatches(result, title)
  );
}

export const MOVIE_METADATA_RUNTIME_TOLERANCE_SECONDS = 300;

function normalizedRuntimeSeconds(value: number | null | undefined) {
  if (!Number.isFinite(value) || Number(value) <= 0) return null;
  return Math.round(Number(value));
}

export function movieMetadataRuntimesCompatible(
  fileRuntimeSeconds: number | null | undefined,
  metadataRuntimeSeconds: number | null | undefined,
  toleranceSeconds = MOVIE_METADATA_RUNTIME_TOLERANCE_SECONDS,
) {
  const fileRuntime = normalizedRuntimeSeconds(fileRuntimeSeconds);
  const metadataRuntime = normalizedRuntimeSeconds(metadataRuntimeSeconds);
  if (fileRuntime === null || metadataRuntime === null) return true;
  return Math.abs(fileRuntime - metadataRuntime) <= Math.max(0, toleranceSeconds);
}

export function movieMetadataYearDelta(queryYear: number | null, metadataYear: number | null) {
  if (queryYear === null || metadataYear === null) return null;
  return Math.abs(queryYear - metadataYear);
}

export function movieMetadataMatchScore(
  queryTitle: string,
  queryYear: number | null,
  metadataTitle: string,
  metadataYear: number | null,
) {
  let score = 0;
  if (exactTitleMatches(queryTitle, metadataTitle)) {
    score += 100;
  } else if (phraseTitleMatches(queryTitle, metadataTitle)) {
    score += 40;
  } else {
    return 0;
  }

  const yearDelta = movieMetadataYearDelta(queryYear, metadataYear);
  if (yearDelta === 0) score += 10;
  else if (yearDelta === 1) score += 5;
  return score;
}

export function movieMetadataMatchAccepts(input: {
  queryTitle: string;
  queryYear: number | null;
  metadataTitle: string;
  metadataYear: number | null;
  fileRuntimeSeconds?: number | null;
  metadataRuntimeSeconds?: number | null;
}) {
  const score = movieMetadataMatchScore(input.queryTitle, input.queryYear, input.metadataTitle, input.metadataYear);
  if (score === 0) return false;
  if (input.queryYear === null) return score >= 100;

  const yearDelta = movieMetadataYearDelta(input.queryYear, input.metadataYear);
  if (yearDelta === null) return score >= 100;
  if (yearDelta === 0) return true;
  if (yearDelta > 1) return false;

  if (score < 100) return false;
  return movieMetadataRuntimesCompatible(input.fileRuntimeSeconds, input.metadataRuntimeSeconds);
}

function tvTitleMatches(result: TmdbTvSearchResult, title: string) {
  const normalizedTitle = normalizeTitle(title);
  return normalizeTitle(result.name) === normalizedTitle || normalizeTitle(result.original_name) === normalizedTitle;
}

function bestSearchResult(results: TmdbSearchResult[] | undefined, title: string, year: number | null) {
  if (!results?.length) return null;
  const exactTitle = results.find((result) => titleMatches(result, title));
  if (!year) return exactTitle ?? results[0];

  const exactYearResults = results.filter((result) => extractYear(result.release_date) === year);
  return exactYearResults.find((result) => titleMatches(result, title)) ?? exactTitle ?? null;
}

function bestTvSearchResult(results: TmdbTvSearchResult[] | undefined, title: string, year: number | null) {
  if (!results?.length) return null;
  const exactTitle = results.find((result) => tvTitleMatches(result, title));
  if (!year) return exactTitle ?? results[0];

  const exactYearResults = results.filter((result) => extractYear(result.first_air_date) === year);
  return exactYearResults.find((result) => tvTitleMatches(result, title)) ?? exactTitle ?? null;
}

function numberOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function preferredCertification(detail: TmdbMovieDetails) {
  const releases = detail.release_dates?.results ?? [];
  const countries = ["US", "GB", "CA", "AU"];
  for (const country of countries) {
    const row = releases.find((item) => item.iso_3166_1 === country);
    const certification = row?.release_dates?.find((item) => stringOrNull(item.certification))?.certification;
    if (certification) return certification;
  }
  return null;
}

function preferredTvCertification(detail: TmdbTvDetails) {
  const ratings = detail.content_ratings?.results ?? [];
  const countries = ["US", "GB", "CA", "AU"];
  for (const country of countries) {
    const rating = stringOrNull(ratings.find((item) => item.iso_3166_1 === country)?.rating);
    if (rating) return rating;
  }
  return null;
}

function preferredTrailer(detail: TmdbMovieDetails) {
  const videos = detail.videos?.results ?? [];
  return (
    videos.find((video) => video.site === "YouTube" && video.type === "Trailer" && video.official) ??
    videos.find((video) => video.site === "YouTube" && video.type === "Trailer") ??
    videos.find((video) => video.site === "YouTube") ??
    null
  );
}

function preferredTvTrailer(detail: TmdbTvDetails) {
  return preferredTrailer(detail as TmdbMovieDetails);
}

function mapTvShowMetadata(detail: TmdbTvDetails, first: TmdbTvSearchResult): MatchedTvShowMetadata {
  const firstAirDate = detail.first_air_date || first.first_air_date || null;
  const trailer = preferredTvTrailer(detail);
  const cast = detail.aggregate_credits?.cast ?? [];
  const crew = detail.aggregate_credits?.crew ?? [];
  const createdBy = (detail.created_by ?? [])
    .filter((person) => person.name)
    .map((person, index) => ({
      providerId: String(person.id),
      creditId: person.credit_id ?? `creator-${person.id}`,
      name: person.name,
      originalName: stringOrNull(person.original_name),
      department: "Creator",
      job: "Creator",
      order: index,
      profilePath: person.profile_path ?? null,
    }));
  const createdByIds = new Set(createdBy.map((credit) => credit.providerId));
  const aggregateCrew = crew
    .filter((credit) => credit.name)
    .map((credit, index) => {
      const job = credit.jobs?.[0];
      return {
        providerId: String(credit.id),
        creditId: credit.credit_id ?? job?.credit_id ?? "",
        name: credit.name,
        originalName: stringOrNull(credit.original_name),
        department: stringOrNull(credit.department),
        job: stringOrNull(job?.job),
        order: createdBy.length + index,
        profilePath: credit.profile_path ?? null,
      };
    })
    .filter((credit) => !createdByIds.has(credit.providerId));

  return {
    provider: "tmdb",
    providerId: String(detail.id),
    title: detail.name || detail.original_name || first.name || first.original_name || "",
    year: extractYear(firstAirDate),
    originalTitle: stringOrNull(detail.original_name ?? first.original_name),
    overview: detail.overview || first.overview || null,
    tagline: stringOrNull(detail.tagline),
    posterPath: detail.poster_path ?? first.poster_path ?? null,
    backdropPath: detail.backdrop_path ?? first.backdrop_path ?? null,
    firstAirDate,
    status: stringOrNull(detail.status),
    homepage: stringOrNull(detail.homepage),
    originalLanguage: stringOrNull(detail.original_language ?? first.original_language),
    imdbId: stringOrNull(detail.external_ids?.imdb_id),
    popularity: detail.popularity ?? first.popularity ?? null,
    voteAverage: detail.vote_average ?? first.vote_average ?? null,
    voteCount: detail.vote_count ?? first.vote_count ?? null,
    certification: preferredTvCertification(detail),
    trailer: trailer
      ? {
          site: trailer.site,
          key: trailer.key,
          name: trailer.name,
        }
      : null,
    genres: (detail.genres ?? [])
      .filter((genre) => genre.name)
      .map((genre) => ({ providerId: String(genre.id), name: genre.name })),
    cast: cast
      .filter((credit) => credit.name)
      .map((credit) => {
        const role = credit.roles?.[0];
        return {
          providerId: String(credit.id),
          creditId: credit.credit_id ?? role?.credit_id ?? "",
          name: credit.name,
          originalName: stringOrNull(credit.original_name),
          character: stringOrNull(role?.character),
          order: credit.order ?? 0,
          profilePath: credit.profile_path ?? null,
        };
      }),
    crew: [...createdBy, ...aggregateCrew],
    videos: (detail.videos?.results ?? [])
      .filter((video) => video.id && video.name && video.site && video.key)
      .map((video) => ({
        providerId: video.id,
        name: video.name,
        site: video.site,
        key: video.key,
        type: stringOrNull(video.type),
        official: Boolean(video.official),
        publishedAt: stringOrNull(video.published_at),
      })),
    keywords: (detail.keywords?.results ?? [])
      .filter((keyword) => keyword.name)
      .map((keyword) => ({
        providerId: String(keyword.id),
        name: keyword.name,
      })),
    productionCompanies: (detail.production_companies ?? [])
      .filter((company) => company.name)
      .map((company) => ({
        providerId: String(company.id),
        name: company.name,
        logoPath: company.logo_path ?? null,
        originCountry: stringOrNull(company.origin_country),
      })),
    productionCountries: (detail.production_countries ?? [])
      .filter((country) => country.iso_3166_1 && country.name)
      .map((country) => ({ iso31661: country.iso_3166_1, name: country.name })),
    spokenLanguages: (detail.spoken_languages ?? [])
      .filter((language) => language.iso_639_1 && language.name)
      .map((language) => ({
        iso6391: language.iso_639_1,
        englishName: stringOrNull(language.english_name),
        name: language.name,
      })),
  };
}

function mapTvSeasonMetadata(detail: TmdbTvSeasonDetails, seasonNumber: number): MatchedTvSeasonMetadata {
  return {
    provider: "tmdb",
    providerId: String(detail.id),
    title: detail.name || (seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`),
    seasonNumber: detail.season_number ?? seasonNumber,
    overview: detail.overview || null,
    posterPath: detail.poster_path ?? null,
    airDate: detail.air_date ?? null,
    voteAverage: numberOrNull(detail.vote_average),
  };
}

function mapTvEpisodeMetadata(
  episode: NonNullable<TmdbTvSeasonDetails["episodes"]>[number] | undefined,
  seasonNumber: number,
  episodeNumber: number,
): MatchedTvEpisodeMetadata | null {
  if (!episode) return null;
  return {
    provider: "tmdb",
    providerId: String(episode.id),
    title: episode.name || `Episode ${episodeNumber}`,
    seasonNumber: episode.season_number ?? seasonNumber,
    episodeNumber: episode.episode_number ?? episodeNumber,
    overview: episode.overview || null,
    stillPath: episode.still_path ?? null,
    airDate: episode.air_date ?? null,
    runtimeSeconds: episode.runtime ? episode.runtime * 60 : null,
    voteAverage: numberOrNull(episode.vote_average),
    voteCount: numberOrNull(episode.vote_count),
  };
}

async function matchMovieMetadataForSearchYear(
  title: string,
  searchYear: number | null,
  resultYear: number | null,
  options: { credentials?: TmdbCredentials; fetch?: TmdbFetch } = {},
) {
  const searchUrl = new URL("https://api.themoviedb.org/3/search/movie");
  searchUrl.searchParams.set("query", title);
  if (searchYear !== null) {
    searchUrl.searchParams.set("year", String(searchYear));
    searchUrl.searchParams.set("primary_release_year", String(searchYear));
  }
  searchUrl.searchParams.set("include_adult", "false");

  const search = await tmdbFetch<{ results: TmdbSearchResult[] }>(searchUrl, options.credentials, options.fetch);
  const first = bestSearchResult(search?.results, title, resultYear);
  if (!first) return null;

  const detailUrl = new URL(`https://api.themoviedb.org/3/movie/${first.id}`);
  detailUrl.searchParams.set("append_to_response", "credits,videos,keywords,release_dates");
  const detail = await tmdbFetch<TmdbMovieDetails>(detailUrl, options.credentials, options.fetch);
  if (!detail) return null;

  const releaseDate = detail.release_date || first.release_date || null;
  const collection = detail.belongs_to_collection
    ? {
        providerId: String(detail.belongs_to_collection.id),
        name: detail.belongs_to_collection.name,
        posterPath: detail.belongs_to_collection.poster_path ?? null,
        backdropPath: detail.belongs_to_collection.backdrop_path ?? null,
      }
    : null;
  const trailer = preferredTrailer(detail);

  return {
    provider: "tmdb",
    providerId: String(detail.id),
    title: detail.title || detail.original_title || first.title || title,
    year: extractYear(releaseDate),
    originalTitle: stringOrNull(detail.original_title) ?? null,
    overview: detail.overview || null,
    tagline: stringOrNull(detail.tagline),
    runtimeSeconds: detail.runtime ? detail.runtime * 60 : null,
    posterPath: detail.poster_path ?? first.poster_path ?? null,
    backdropPath: detail.backdrop_path ?? first.backdrop_path ?? null,
    releaseDate,
    status: stringOrNull(detail.status),
    homepage: stringOrNull(detail.homepage),
    originalLanguage: stringOrNull(detail.original_language ?? first.original_language),
    imdbId: stringOrNull(detail.imdb_id),
    budget: numberOrNull(detail.budget),
    revenue: numberOrNull(detail.revenue),
    popularity: detail.popularity ?? first.popularity ?? null,
    voteAverage: detail.vote_average ?? first.vote_average ?? null,
    voteCount: detail.vote_count ?? first.vote_count ?? null,
    certification: preferredCertification(detail),
    collection,
    trailer: trailer
      ? {
          site: trailer.site,
          key: trailer.key,
          name: trailer.name,
        }
      : null,
    genres: (detail.genres ?? [])
      .filter((genre) => genre.name)
      .map((genre) => ({ providerId: String(genre.id), name: genre.name })),
    cast: (detail.credits?.cast ?? [])
      .filter((credit) => credit.name)
      .map((credit) => ({
        providerId: String(credit.id),
        creditId: credit.credit_id ?? "",
        name: credit.name,
        originalName: stringOrNull(credit.original_name),
        character: stringOrNull(credit.character),
        order: credit.order ?? 0,
        profilePath: credit.profile_path ?? null,
      })),
    crew: (detail.credits?.crew ?? [])
      .filter((credit) => credit.name)
      .map((credit, index) => ({
        providerId: String(credit.id),
        creditId: credit.credit_id ?? "",
        name: credit.name,
        originalName: stringOrNull(credit.original_name),
        department: stringOrNull(credit.department),
        job: stringOrNull(credit.job),
        order: index,
        profilePath: credit.profile_path ?? null,
      })),
    videos: (detail.videos?.results ?? [])
      .filter((video) => video.id && video.name && video.site && video.key)
      .map((video) => ({
        providerId: video.id,
        name: video.name,
        site: video.site,
        key: video.key,
        type: stringOrNull(video.type),
        official: Boolean(video.official),
        publishedAt: stringOrNull(video.published_at),
      })),
    keywords: (detail.keywords?.keywords ?? [])
      .filter((keyword) => keyword.name)
      .map((keyword) => ({
        providerId: String(keyword.id),
        name: keyword.name,
      })),
    productionCompanies: (detail.production_companies ?? [])
      .filter((company) => company.name)
      .map((company) => ({
        providerId: String(company.id),
        name: company.name,
        logoPath: company.logo_path ?? null,
        originCountry: stringOrNull(company.origin_country),
      })),
    productionCountries: (detail.production_countries ?? [])
      .filter((country) => country.iso_3166_1 && country.name)
      .map((country) => ({ iso31661: country.iso_3166_1, name: country.name })),
    spokenLanguages: (detail.spoken_languages ?? [])
      .filter((language) => language.iso_639_1 && language.name)
      .map((language) => ({
        iso6391: language.iso_639_1,
        englishName: stringOrNull(language.english_name),
        name: language.name,
      })),
  } satisfies MatchedMovieMetadata;
}

function movieMetadataSearchYears(queryYear: number | null) {
  if (queryYear === null) return [null];
  return [queryYear, queryYear - 1, queryYear + 1, null];
}

export async function matchMovieMetadata(
  title: string,
  year: number | null,
  options: { credentials?: TmdbCredentials; fetch?: TmdbFetch } = {},
) {
  const seenProviderIds = new Set<string>();

  for (const searchYear of movieMetadataSearchYears(year)) {
    const metadata = await matchMovieMetadataForSearchYear(title, searchYear, searchYear ?? year, options);
    if (!metadata || seenProviderIds.has(metadata.providerId)) continue;
    seenProviderIds.add(metadata.providerId);
    return metadata;
  }

  return null;
}

export async function matchTvSeasonMetadata(
  title: string,
  year: number | null,
  seasonNumber: number,
  options: { credentials?: TmdbCredentials; fetch?: TmdbFetch } = {},
) {
  const searchUrl = new URL("https://api.themoviedb.org/3/search/tv");
  searchUrl.searchParams.set("query", title);
  if (year) searchUrl.searchParams.set("first_air_date_year", String(year));
  searchUrl.searchParams.set("include_adult", "false");

  const search = await tmdbFetch<{ results: TmdbTvSearchResult[] }>(searchUrl, options.credentials, options.fetch);
  const first = bestTvSearchResult(search?.results, title, year);
  if (!first) return null;

  const detailUrl = new URL(`https://api.themoviedb.org/3/tv/${first.id}`);
  detailUrl.searchParams.set("append_to_response", "aggregate_credits,videos,keywords,content_ratings,external_ids");
  const detail = await tmdbFetch<TmdbTvDetails>(detailUrl, options.credentials, options.fetch);
  if (!detail) return null;

  const seasonUrl = new URL(`https://api.themoviedb.org/3/tv/${detail.id}/season/${seasonNumber}`);
  const season = await tmdbFetch<TmdbTvSeasonDetails>(seasonUrl, options.credentials, options.fetch);
  if (!season) return null;

  return {
    show: mapTvShowMetadata(detail, first),
    season: mapTvSeasonMetadata(season, seasonNumber),
    episodes: (season.episodes ?? [])
      .filter((episode) => typeof episode.episode_number === "number")
      .map((episode) => mapTvEpisodeMetadata(episode, seasonNumber, episode.episode_number ?? 0))
      .filter((episode) => episode !== null),
  } satisfies MatchedTvSeasonLookup;
}

export async function testTmdbConnection(options: { credentials?: TmdbCredentials; fetch?: TmdbFetch } = {}) {
  const metadata = await matchMovieMetadata("The Matrix", 1999, options);
  if (!metadata) {
    return {
      ok: false,
      message: "TMDb credentials are missing or no test movie was returned.",
    };
  }

  return {
    ok: true,
    message: `TMDb returned ${metadata.title}${metadata.year ? ` (${metadata.year})` : ""}.`,
    title: metadata.title,
    year: metadata.year,
    posterPath: metadata.posterPath,
  };
}
