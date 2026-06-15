import {
  matchMovieMetadata,
  matchTvSeasonMetadata,
  type MatchedMovieMetadata,
  type MatchedTvSeasonLookup,
} from "./tmdb";
import { movieLookupCandidates, type ParsedMovieLookup } from "./movie-lookup";

export type MovieMetadataMatcher = (title: string, year: number | null) => Promise<MatchedMovieMetadata | null>;

export type TvSeasonMetadataMatcher = (
  title: string,
  year: number | null,
  seasonNumber: number,
) => Promise<MatchedTvSeasonLookup | null>;

export async function lookupMovieMetadata(
  title: string,
  year: number | null,
  onError?: (error: unknown) => Promise<void>,
  matcher: MovieMetadataMatcher = matchMovieMetadata,
) {
  try {
    return await matcher(title, year);
  } catch (error) {
    await onError?.(error);
    return null;
  }
}

export async function lookupMovieMetadataFromCandidates(
  candidates: ParsedMovieLookup[],
  options: {
    onError?: (error: unknown) => Promise<void>;
    matcher?: MovieMetadataMatcher;
  } = {},
) {
  for (const candidate of candidates) {
    const metadata = await lookupMovieMetadata(candidate.title, candidate.year, options.onError, options.matcher);
    if (metadata) return metadata;
  }
  return null;
}

export async function lookupMovieMetadataFromPath(
  filePath: string,
  options: {
    libraryRoot?: string | null;
    fallback?: ParsedMovieLookup;
    onError?: (error: unknown) => Promise<void>;
    matcher?: MovieMetadataMatcher;
  } = {},
) {
  return lookupMovieMetadataFromCandidates(
    movieLookupCandidates(filePath, options.fallback, {
      libraryRoot: options.libraryRoot,
    }),
    options,
  );
}

export async function lookupTvSeasonMetadata(
  title: string,
  year: number | null,
  seasonNumber: number,
  onError?: (error: unknown) => Promise<void>,
  matcher: TvSeasonMetadataMatcher = matchTvSeasonMetadata,
) {
  try {
    return await matcher(title, year, seasonNumber);
  } catch (error) {
    await onError?.(error);
    return null;
  }
}
