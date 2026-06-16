import {
  matchMovieMetadata,
  matchTvSeasonMetadata,
  movieMetadataMatchAccepts,
  movieMetadataMatchScore,
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

export type MovieMetadataLookupResult = {
  metadata: MatchedMovieMetadata;
  candidate: ParsedMovieLookup;
};

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
    fileRuntimeSeconds?: number | null;
    onError?: (error: unknown) => Promise<void>;
    matcher?: MovieMetadataMatcher;
  } = {},
): Promise<MovieMetadataLookupResult | null> {
  let best: (MovieMetadataLookupResult & { score: number }) | null = null;

  for (const candidate of candidates) {
    const metadata = await lookupMovieMetadata(candidate.title, candidate.year, options.onError, options.matcher);
    if (!metadata) continue;

    if (
      !movieMetadataMatchAccepts({
        queryTitle: candidate.title,
        queryYear: candidate.year,
        metadataTitle: metadata.title,
        metadataYear: metadata.year,
        metadataAlternativeTitles: metadata.alternativeTitles,
        metadataOriginalTitle: metadata.originalTitle,
        fileRuntimeSeconds: options.fileRuntimeSeconds,
        metadataRuntimeSeconds: metadata.runtimeSeconds,
      })
    ) {
      continue;
    }

    const score = movieMetadataMatchScore(candidate.title, candidate.year, metadata.title, metadata.year, {
      metadataAlternativeTitles: metadata.alternativeTitles,
      metadataOriginalTitle: metadata.originalTitle,
    });

    if (!best || score > best.score) {
      best = { metadata, candidate, score };
      if (score >= 110) break;
    }
  }

  if (!best) return null;
  return { metadata: best.metadata, candidate: best.candidate };
}

export async function lookupMovieMetadataFromPath(
  filePath: string,
  options: {
    fileRuntimeSeconds?: number | null;
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
