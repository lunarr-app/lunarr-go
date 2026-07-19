import type { getHealthStatus } from "$lib/server/health";
import type { approveDevicePairing, pollDevicePairing, startDevicePairing } from "$lib/server/auth/device-pairing";
import type { runSettingsAction, getAdminSettingsResponse } from "$lib/server/settings-commands";
import type { startAllLibraryScans } from "$lib/server/scanner";
import type { startMovieMetadataRefreshJob } from "$lib/server/metadata/movies";
import type { listAllShares, listSharesForMedia } from "$lib/server/shares/index";
import type { createApiKey, listApiKeys } from "$lib/server/auth/api-keys";
import type { createManagedUser, listManagedUsers } from "$lib/server/auth/users-admin";
import type { RefreshMovieMetadataResult } from "$lib/server/metadata/movies";
import type { RefreshTvShowMetadataResult } from "$lib/server/metadata/tv";
import type { getMovieCredits, getMovieDetail, getMovieOverview } from "$lib/server/media/movies/detail";
import type { listBecauseYouWatchedMovies } from "$lib/server/media/movies/discover";
import type { getPersonDetail } from "$lib/server/media/people";
import type { loadSimilarMovies, loadSimilarShows } from "$lib/server/media/similar-page-load";
import type {
  getEpisodeDetail,
  getShowCredits,
  getShowDetail,
  getShowOverview,
  getShowSeasonDetail,
} from "$lib/server/media/shows/detail";
import type { listBecauseYouWatchedShows } from "$lib/server/media/shows/discover";
import type {
  createLibrary,
  getLibrary,
  listLibrariesWithScanStatus,
  listLibraryShareUsers,
} from "$lib/server/libraries";
import type { getScanJobSummary, listPlaybackSessions, listScanErrorsForJob, listScanJobs } from "$lib/server/jobs";
import type { PlaybackData } from "$lib/server/playback";
import type { SegmentSkipPreferences } from "$lib/server/playback/segment-skip-preferences";
import type { TranscodePolicy } from "$lib/server/transcoding/policy";
import type { CreateSharePayload, PublicShareRecord, SharePageData, ShareSeasonData } from "$lib/shares/types";
import type { CatalogPageInfo, MovieRowsResponse, MovieSummary, ShowRowsResponse, ShowSummary } from "$lib/media/types";

export type {
  CatalogPageInfo,
  EpisodeSummary,
  MovieBrowseRailResponse,
  MovieRowsResponse,
  MovieSummary,
  ShowBrowseRailResponse,
  ShowBrowseRowsResponse,
  ShowRowsResponse,
  ShowSummary,
} from "$lib/media/types";

export type ApiErrorResponse = {
  type: string;
  title: string;
  status: number;
  detail: string;
};

export type ApiOkResponse = {
  ok: boolean;
};

export type PersonDetailResponse = NonNullable<Awaited<ReturnType<typeof getPersonDetail>>>;
export type PersonRecord = PersonDetailResponse["person"];

export type { PersonFilmographyStats } from "$lib/server/media/people";

export type MovieFullResponse = NonNullable<Awaited<ReturnType<typeof getMovieDetail>>>;
export type MovieOverviewResponse = NonNullable<Awaited<ReturnType<typeof getMovieOverview>>>;
export type MovieCreditsResponse = NonNullable<Awaited<ReturnType<typeof getMovieCredits>>>;
export type SimilarMoviesResponse = NonNullable<Awaited<ReturnType<typeof loadSimilarMovies>>>;

export type ShowFullResponse = NonNullable<Awaited<ReturnType<typeof getShowDetail>>>;
export type ShowOverviewResponse = NonNullable<Awaited<ReturnType<typeof getShowOverview>>>;
export type ShowCreditsResponse = NonNullable<Awaited<ReturnType<typeof getShowCredits>>>;
export type ShowSeasonDetailResponse = NonNullable<Awaited<ReturnType<typeof getShowSeasonDetail>>>;
export type EpisodeDetailResponse = NonNullable<Awaited<ReturnType<typeof getEpisodeDetail>>>;
export type SimilarShowsResponse = NonNullable<Awaited<ReturnType<typeof loadSimilarShows>>>;

export type ContinueWatchingResponse = {
  movies: MovieRowsResponse["continueWatching"];
  moviesPage: CatalogPageInfo;
  episodes: ShowRowsResponse["continueWatching"];
  episodesPage: CatalogPageInfo;
  nextUp: ShowRowsResponse["nextUp"];
  nextUpPage: CatalogPageInfo;
};

export type ContinueWatchingMoviesResponse = {
  movies: MovieRowsResponse["continueWatching"];
  pageInfo: CatalogPageInfo;
};

export type ContinueWatchingEpisodesResponse = {
  episodes: ShowRowsResponse["continueWatching"];
  episodesPage: CatalogPageInfo;
  nextUp: ShowRowsResponse["nextUp"];
  nextUpPage: CatalogPageInfo;
};

export type GuestSharePageResponse = {
  share: SharePageData;
};

export type GuestShareSeasonResponse = {
  season: ShareSeasonData;
};

export type MeResponse = {
  user: NonNullable<App.Locals["user"]>;
  transcodePolicy: TranscodePolicy;
  continueMaxAgeDays: number;
  segmentSkip: SegmentSkipPreferences;
};

export type ProfilePreferencesResponse = Omit<MeResponse, "user">;

export type LibraryListItem = Awaited<ReturnType<typeof listLibrariesWithScanStatus>>[number];
export type LibraryShareUser = Awaited<ReturnType<typeof listLibraryShareUsers>>[number];
export type LibraryRecord = Awaited<ReturnType<typeof createLibrary>>;
export type LibraryDetail = NonNullable<Awaited<ReturnType<typeof getLibrary>>>;

export type LibraryResponse = {
  library: LibraryRecord;
};

export type LibraryDetailResponse = {
  library: LibraryDetail;
};

export type LibrariesResponse = {
  libraries: LibraryListItem[];
  users: LibraryShareUser[];
  tmdbConfigured: boolean;
};

export type JobSummary = Awaited<ReturnType<typeof getScanJobSummary>>;
export type ScanJobListItem = Awaited<ReturnType<typeof listScanJobs>>[number];
export type PlaybackSessionListItem = Awaited<ReturnType<typeof listPlaybackSessions>>[number];
export type ScanErrorListItem = Awaited<ReturnType<typeof listScanErrorsForJob>>[number];

export type JobsResponse = {
  summary: JobSummary;
  playbackSessionSummary: JobSummary;
  playbackSessions: PlaybackSessionListItem[];
  jobs: ScanJobListItem[];
};

export type JobErrorsResponse = {
  errors: ScanErrorListItem[];
  limit: number;
};

export type AdminSharesListResponse = {
  shares: Awaited<ReturnType<typeof listAllShares>>;
};

export type MediaSharesListResponse = {
  shares: Awaited<ReturnType<typeof listSharesForMedia>>;
};

export type ShareCreateResponse = {
  share: PublicShareRecord;
};

export type ShareRevokeResponse = {
  share: PublicShareRecord;
};

export type MetadataRefreshResponse = RefreshMovieMetadataResult | RefreshTvShowMetadataResult;
export type ScanStartResponse = string;
export type PlaybackDataResponse = PlaybackData;

export type CreateShareRequest = CreateSharePayload;

export type ScanAllLibrariesResponse = Awaited<ReturnType<typeof startAllLibraryScans>>;
export type SettingsJobStartResponse = Awaited<ReturnType<typeof startMovieMetadataRefreshJob>>;
export type SettingsActionResponse = Awaited<ReturnType<typeof runSettingsAction>>;
export type HealthResponse = Awaited<ReturnType<typeof getHealthStatus>>;
export type DevicePairingStartResponse = Awaited<ReturnType<typeof startDevicePairing>>;
export type DevicePairingPollResponse = Awaited<ReturnType<typeof pollDevicePairing>>;
export type DevicePairingApproveResponse = Awaited<ReturnType<typeof approveDevicePairing>>;

export type SettingsResponse = Awaited<ReturnType<typeof getAdminSettingsResponse>>;

export type DiscoverMoviesResponse = Awaited<ReturnType<typeof listBecauseYouWatchedMovies>>;
export type DiscoverShowsResponse = Awaited<ReturnType<typeof listBecauseYouWatchedShows>>;

export type UsersResponse = {
  users: Awaited<ReturnType<typeof listManagedUsers>>;
};

export type UserResponse = {
  user: Awaited<ReturnType<typeof createManagedUser>>;
};

export type ApiKeyListResponse = {
  apiKeys: Awaited<ReturnType<typeof listApiKeys>>;
};

export type CreateApiKeyResponse = Awaited<ReturnType<typeof createApiKey>>;

export type WatchlistToggleResponse = {
  ok: boolean;
  inWatchlist: boolean;
};

export type WatchlistStatusResponse = {
  inWatchlist: boolean;
};

export type WatchlistPageResponse = {
  movies: MovieSummary[];
  moviesPage: CatalogPageInfo;
  shows: ShowSummary[];
  showsPage: CatalogPageInfo;
};

export type WatchlistMoviesResponse = {
  movies: MovieSummary[];
  pageInfo: CatalogPageInfo;
};

export type WatchlistShowsResponse = {
  shows: ShowSummary[];
  pageInfo: CatalogPageInfo;
};

export type { ManagedUser } from "$lib/server/auth/users-admin";
export type { ApiKeySummary } from "$lib/server/auth/api-keys";

/** OpenAPI component schemas backed by concrete TypeScript contract types. */
export const OPENAPI_TYPED_SCHEMAS = [
  "ErrorResponse",
  "HealthResponse",
  "DevicePairingStartResponse",
  "DevicePairingPollResponse",
  "DevicePairingApproveResponse",
  "OkResponse",
  "User",
  "MeResponse",
  "ProfilePreferencesResponse",
  "TranscodePolicy",
  "TranscodeQualityTarget",
  "PersonRecord",
  "PersonFilmographyStats",
  "PersonDetailResponse",
  "MovieRowsResponse",
  "MovieBrowseRailResponse",
  "MovieFullResponse",
  "MovieOverviewResponse",
  "MovieCreditsResponse",
  "SimilarMoviesResponse",
  "DiscoverMoviesResponse",
  "DiscoverShowsResponse",
  "ShowRowsResponse",
  "ShowBrowseRailResponse",
  "ShowFullResponse",
  "ShowOverviewResponse",
  "ShowCreditsResponse",
  "ShowSeasonDetailResponse",
  "EpisodeDetailResponse",
  "SimilarShowsResponse",
  "ContinueWatchingResponse",
  "ManagedUser",
  "UsersResponse",
  "UserResponse",
  "ApiKeySummary",
  "ApiKeyListResponse",
  "CreateApiKeyResponse",
  "SettingsResponse",
  "GuestShareMoviePage",
  "GuestShareShowPage",
  "GuestSharePageData",
  "GuestSharePageResponse",
  "GuestShareSeasonData",
  "GuestShareSeasonResponse",
  "ShareEpisode",
  "ShareSeasonStub",
  "PublicShareRecord",
  "AdminShareRecord",
  "AdminSharesListResponse",
  "MediaSharesListResponse",
  "CreateShareRequest",
  "ShareCreateResponse",
  "ShareRevokeResponse",
  "ScanAllLibrariesResponse",
  "SettingsJobStartResponse",
  "SettingsActionResponse",
  "PlaybackArtifactsCleanupResponse",
  "TmdbTestResponse",
  "PlaybackItem",
  "PlaybackDecision",
  "SubtitleTrack",
  "PlaybackDataResponse",
  "ScanJobRow",
  "PlaybackSessionJobRow",
  "ScanErrorRow",
  "JobsResponse",
  "JobErrorsResponse",
  "LibraryListItem",
  "LibraryDetail",
  "LibraryResponse",
  "LibraryDetailResponse",
  "LibrariesResponse",
  "MetadataRefreshResponse",
  "ScanStartResponse",
  "WatchlistToggleResponse",
  "WatchlistStatusResponse",
  "WatchlistPageResponse",
  "WatchlistMoviesResponse",
  "WatchlistShowsResponse",
  "ContinueWatchingMoviesResponse",
  "ContinueWatchingEpisodesResponse",
] as const;
