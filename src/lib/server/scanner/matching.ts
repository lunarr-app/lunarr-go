import {
  matchMovieMetadata,
  matchTvSeasonMetadata,
  type MatchedMovieMetadata,
  type MatchedTvSeasonLookup,
} from "../metadata/tmdb";

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
