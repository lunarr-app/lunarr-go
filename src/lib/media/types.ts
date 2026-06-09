export type MovieSummary = {
  id: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  releaseDate: string | null;
  popularity: number | null;
  voteAverage: number | null;
  fileCount: number;
  resumeFileId: string | null;
  progressSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
};

export type EpisodeSummary = {
  id: string;
  title: string;
  showId: string;
  showTitle: string;
  seasonId: string;
  seasonTitle: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  releaseDate: string | null;
  runtimeSeconds: number | null;
  stillUrl: string | null;
  showPosterUrl: string | null;
  fileCount: number;
  fileId: string | null;
  progressSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
};

export type ShowSummary = {
  id: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  status: string | null;
  popularity: number | null;
  voteAverage: number | null;
  episodeCount: number;
  seasonCount: number;
  latestFileCreatedAt: string | null;
  latestEpisodeReleaseDate: string | null;
  character?: string | null;
};
