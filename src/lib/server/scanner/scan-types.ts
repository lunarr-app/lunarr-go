import type { LibraryKind, MediaKind } from "../db/schema";
import type { MovieMetadataMatcher, TvSeasonMetadataMatcher } from "../metadata/matching";
import type { MatchedTvSeasonLookup } from "../metadata/tmdb";
import { runMovieMetadataRefreshJob } from "../metadata/movies";
import { runTvMetadataRefreshJob } from "../metadata/tv";
import type { LibraryStorage, StorageFileInfo, StorageWalkEntry } from "../storage";
import type { MediaProbe, ProbeBackend } from "../transcoding/backend";
import { runMediaProbeRefreshJob } from "../transcoding/probe-jobs";

export type WalkEntry = StorageWalkEntry;

export type ScanOptions = {
  metadataMatcher?: MovieMetadataMatcher;
  tvSeasonMetadataMatcher?: TvSeasonMetadataMatcher;
  fileWalker?: (root: string) => AsyncGenerator<WalkEntry>;
  directoryFileReader?: (directory: string) => Promise<DirectoryReadResult>;
  probeBackend?: ProbeBackend | null;
  storage?: LibraryStorage;
};

export type ResumeInterruptedJobsOptions = {
  scanOptions?: ScanOptions;
  movieMetadataOptions?: Parameters<typeof runMovieMetadataRefreshJob>[1];
  tvMetadataOptions?: Parameters<typeof runTvMetadataRefreshJob>[1];
  mediaProbeOptions?: Parameters<typeof runMediaProbeRefreshJob>[1];
};

export type DirectoryReadResult = {
  ok: boolean;
  paths: string[];
};

export type ExistingMediaFile = {
  id: string;
  library_id: string;
  media_item_id: string;
  path: string;
  basename: string;
  extension: string;
  size_bytes: number;
  mtime_ms: number;
  duration_seconds: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  container: string | null;
  existing_provider: string | null;
};

export type ScannableLibrary = {
  id: string;
  kind: LibraryKind;
  path: string;
};

export type ScanFileResult = "added" | "updated" | "unchanged";

export type ProbedFileMetadata = {
  probe: MediaProbe | null;
  values: {
    duration_seconds: number | null;
    video_codec: string | null;
    audio_codec: string | null;
    container: string | null;
  };
};

export type ScanContext = {
  directoryEntryCache: Map<string, DirectoryReadResult>;
  directoryVideoCounts: Map<string, number>;
  directoryFileReader: (directory: string) => Promise<DirectoryReadResult>;
  existingFilesByPath: Map<string, ExistingMediaFile>;
  tvSeasonMetadataCache: Map<string, Promise<MatchedTvSeasonLookup | null>>;
  tvSeasonEpisodeSyncCache: Map<string, Promise<void>>;
  probeBackend: ProbeBackend | null;
  storage: LibraryStorage;
};

export type LibraryScanHandler = {
  mediaKind: MediaKind;
  scanFile: (
    library: ScannableLibrary,
    filePath: string,
    fileInfo: StorageFileInfo | undefined,
    context: ScanContext,
    onMetadataError?: (error: unknown) => Promise<void>,
    metadataMatcher?: MovieMetadataMatcher,
    tvSeasonMetadataMatcher?: TvSeasonMetadataMatcher,
  ) => Promise<ScanFileResult>;
};
