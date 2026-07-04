import type { RefreshMovieMetadataResult } from "$lib/server/metadata/movies";
import type { RefreshTvShowMetadataResult } from "$lib/server/metadata/tv";
import type { getPersonDetail } from "$lib/server/media/people";
import type { createLibrary, listLibrariesWithScanStatus, listLibraryShareUsers } from "$lib/server/libraries";
import type { getScanJobSummary, listPlaybackSessions, listScanErrorsForJob, listScanJobs } from "$lib/server/jobs";
import type { PlaybackData } from "$lib/server/playback";
import type { TranscodePolicy } from "$lib/server/transcoding/policy";
import type {
  AdminShareRecord,
  CreateSharePayload,
  PublicShareRecord,
  SharePageData,
  ShareSeasonData,
} from "$lib/shares/types";

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
  error: string;
};

export type ApiOkResponse = {
  ok: boolean;
};

export type PersonDetailResponse = NonNullable<Awaited<ReturnType<typeof getPersonDetail>>>;
export type PersonRecord = PersonDetailResponse["person"];

export type { PersonFilmographyStats } from "$lib/server/media/people";

export type GuestSharePageResponse = {
  share: SharePageData;
};

export type GuestShareSeasonResponse = {
  season: ShareSeasonData;
};

export type MeResponse = {
  user: NonNullable<App.Locals["user"]>;
  transcodePolicy: TranscodePolicy;
};

export type LibraryListItem = Awaited<ReturnType<typeof listLibrariesWithScanStatus>>[number];
export type LibraryShareUser = Awaited<ReturnType<typeof listLibraryShareUsers>>[number];
export type LibraryRecord = Awaited<ReturnType<typeof createLibrary>>;

export type LibraryResponse = {
  library: LibraryRecord;
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

export type SharesListResponse = {
  shares: AdminShareRecord[] | PublicShareRecord[];
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

/** OpenAPI component schemas backed by concrete TypeScript contract types. */
export const OPENAPI_TYPED_SCHEMAS = [
  "ErrorResponse",
  "OkResponse",
  "User",
  "MeResponse",
  "TranscodePolicy",
  "TranscodeQualityTarget",
  "PersonRecord",
  "PersonFilmographyStats",
  "PersonDetailResponse",
  "MovieRowsResponse",
  "MovieBrowseRailResponse",
  "ShowRowsResponse",
  "ShowBrowseRailResponse",
  "ContinueWatchingResponse",
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
  "SharesListResponse",
  "CreateShareRequest",
  "ShareCreateResponse",
  "ShareRevokeResponse",
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
  "LibraryResponse",
  "LibrariesResponse",
  "MetadataRefreshResponse",
  "ScanStartResponse",
] as const;
