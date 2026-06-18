import { tmdbImageUrl } from "$lib/media/images";
import type { MovieBrowseRow, MovieProgressRow } from "./types";

export function summarizeMovieProgress(progressRows: MovieProgressRow[]) {
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

export function publicMovieSummary(
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
