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

export type CatalogPageInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type MovieRowsResponse = {
  continueWatching: MovieSummary[];
  continueWatchingPage: CatalogPageInfo;
  all: MovieSummary[];
  allPage: CatalogPageInfo;
  recent: MovieSummary[];
  recentPage: CatalogPageInfo;
  latest: MovieSummary[];
  latestPage: CatalogPageInfo;
  popular: MovieSummary[];
  popularPage: CatalogPageInfo;
};

export type MovieBrowseRailResponse = Partial<MovieRowsResponse>;

export type ShowBrowseRowsResponse = {
  all: ShowSummary[];
  allPage: CatalogPageInfo;
  recent: ShowSummary[];
  recentPage: CatalogPageInfo;
  latest: ShowSummary[];
  latestPage: CatalogPageInfo;
  popular: ShowSummary[];
  popularPage: CatalogPageInfo;
};

export type ShowBrowseRailResponse = Partial<ShowBrowseRowsResponse>;

export type ShowRowsResponse = {
  continueWatching: EpisodeSummary[];
  continueWatchingPage: CatalogPageInfo;
  nextUp: EpisodeSummary[];
  nextUpPage: CatalogPageInfo;
} & ShowBrowseRowsResponse;

export type FixMatchCandidate = {
  providerId: string;
  title: string;
  year: number | null;
  overview: string | null;
  posterPath: string | null;
};
