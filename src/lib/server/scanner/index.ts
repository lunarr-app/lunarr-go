import { sql } from "kysely";
import path from "node:path";
import { getDb } from "../db";
import { createId } from "../id";
import { nowIso } from "../time";
import { getLibrary, listLibraries } from "../libraries";
import type { LibraryKind, MediaKind } from "../db/schema";
import { runMovieMetadataRefreshJob } from "../metadata/movies";
import {
  emptyMovieMetadataValues,
  movieMetadataValues,
  syncMovieMetadataRelations,
  syncTvShowMetadataRelations,
  tvEpisodeMetadataValues,
  tvSeasonMetadataValues,
  tvShowMetadataValues
} from "../metadata/store";
import type { MatchedTvEpisodeMetadata, MatchedTvSeasonLookup, MatchedTvSeasonMetadata, MatchedTvShowMetadata } from "../metadata/tmdb";
import { runTvMetadataRefreshJob } from "../metadata/tv";
import { createLibraryStorage, type LibraryStorage, type StorageFileInfo, type StorageWalkEntry } from "../storage";
import type { MediaProbe, ProbeBackend, SeekableTranscodeInputSource } from "../transcoding/backend";
import { nodeAvBackend } from "../transcoding/node-av";
import { mediaFileValuesFromProbe, replaceMediaStreamInfo } from "../transcoding/probe";
import { runMediaProbeRefreshJob } from "../transcoding/probe-jobs";
import { createSeekableInputSourceFromStorage } from "../transcoding/seekable-input";
import { movieLookupFromPath } from "../metadata/movie-lookup";
import { lookupMovieMetadata, lookupTvSeasonMetadata, type MovieMetadataMatcher, type TvSeasonMetadataMatcher } from "./matching";
import { isSidecarSubtitlePath, isVideoFilePath } from "./media-files";
import { parseTvEpisodePath, type ParsedTvEpisode } from "./tv-parser";

type WalkEntry = StorageWalkEntry;

type ScanOptions = {
  metadataMatcher?: MovieMetadataMatcher;
  tvSeasonMetadataMatcher?: TvSeasonMetadataMatcher;
  fileWalker?: (root: string) => AsyncGenerator<WalkEntry>;
  directoryFileReader?: (directory: string) => Promise<DirectoryReadResult>;
  probeBackend?: ProbeBackend | null;
  storage?: LibraryStorage;
};

type ResumeInterruptedJobsOptions = {
  scanOptions?: ScanOptions;
  movieMetadataOptions?: Parameters<typeof runMovieMetadataRefreshJob>[1];
  tvMetadataOptions?: Parameters<typeof runTvMetadataRefreshJob>[1];
  mediaProbeOptions?: Parameters<typeof runMediaProbeRefreshJob>[1];
};

type ScanContext = {
  directoryEntryCache: Map<string, DirectoryReadResult>;
  directoryVideoCounts: Map<string, number>;
  directoryFileReader: (directory: string) => Promise<DirectoryReadResult>;
  existingFilesByPath: Map<string, ExistingMediaFile>;
  tvSeasonMetadataCache: Map<string, Promise<MatchedTvSeasonLookup | null>>;
  tvSeasonEpisodeSyncCache: Map<string, Promise<void>>;
  probeBackend: ProbeBackend | null;
  storage: LibraryStorage;
};

type DirectoryReadResult = {
  ok: boolean;
  paths: string[];
};

type ExistingMediaFile = {
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

type ScannableLibrary = {
  id: string;
  kind: LibraryKind;
  path: string;
};

type ScanFileResult = "added" | "updated" | "unchanged";

type ProbedFileMetadata = {
  probe: MediaProbe | null;
  values: {
    duration_seconds: number | null;
    video_codec: string | null;
    audio_codec: string | null;
    container: string | null;
  };
};

type LibraryScanHandler = {
  mediaKind: MediaKind;
  scanFile: (
    library: ScannableLibrary,
    filePath: string,
    fileInfo: StorageFileInfo | undefined,
    context: ScanContext,
    onMetadataError?: (error: unknown) => Promise<void>,
    metadataMatcher?: MovieMetadataMatcher,
    tvSeasonMetadataMatcher?: TvSeasonMetadataMatcher
  ) => Promise<ScanFileResult>;
};

const runningScanJobs = new Set<string>();

function isTerminalScanStatus(status: "queued" | "running" | "completed" | "failed" | "cancelled") {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function sortTitle(title: string) {
  return title.replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

async function updateJob(
  id: string,
  values: Partial<{
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    started_at: string | null;
    finished_at: string | null;
    files_seen: number;
    files_added: number;
    files_updated: number;
    files_removed: number;
    errors_count: number;
    checkpoint_value: string | null;
    runner_token: string | null;
    runner_heartbeat_at: string | null;
  }>,
  runnerToken?: string
) {
  const db = await getDb();
  const now = nowIso();
  const terminalStatus = values.status ? isTerminalScanStatus(values.status) : false;
  let query = db
    .updateTable("scan_job")
    .set({
      ...values,
      ...(terminalStatus
        ? { checkpoint_value: null, runner_token: null, runner_heartbeat_at: null }
        : runnerToken
          ? { runner_heartbeat_at: now }
          : {}),
      updated_at: now
    })
    .where("id", "=", id);

  if (runnerToken) query = query.where("runner_token", "=", runnerToken);
  await query.execute();
}

async function addJobError(jobId: string, filePath: string, error: unknown) {
  const db = await getDb();
  const message = error instanceof Error ? error.message : String(error);
  await db
    .insertInto("scan_job_error")
    .values({ scan_job_id: jobId, path: filePath, message, created_at: nowIso() })
    .execute();
}

async function probeScannedFile(
  mediaFileId: string,
  info: StorageFileInfo,
  context: ScanContext
): Promise<ProbedFileMetadata> {
  const fallbackValues = mediaFileValuesFromProbe({ extension: info.extension }, null);
  if (!context.probeBackend) {
    return {
      probe: null,
      values: fallbackValues
    };
  }

  let inputSource: SeekableTranscodeInputSource | undefined;
  try {
    inputSource =
      context.storage.source === "sftp"
        ? createSeekableInputSourceFromStorage({
            file: {
              path: info.path,
              extension: info.extension,
              container: fallbackValues.container,
              sizeBytes: info.size
            },
            storage: context.storage,
            timeoutMs: context.storage.operationTimeoutMs
          })
        : undefined;
    const probe = await context.probeBackend.probe({
      mediaFileId,
      path: info.path,
      inputSource
    });
    return {
      probe,
      values: mediaFileValuesFromProbe({ extension: info.extension }, probe)
    };
  } catch {
    return {
      probe: null,
      values: fallbackValues
    };
  } finally {
    await inputSource?.close().catch(() => undefined);
  }
}

function fileValuesFromExisting(existing: ExistingMediaFile) {
  return {
    duration_seconds: existing.duration_seconds,
    video_codec: existing.video_codec,
    audio_codec: existing.audio_codec,
    container: existing.container
  };
}

function basicFileMetadataUnchanged(
  existing: ExistingMediaFile,
  library: ScannableLibrary,
  info: StorageFileInfo
) {
  return (
    existing.library_id === library.id &&
    existing.basename === info.basename &&
    existing.extension === info.extension &&
    existing.size_bytes === info.size &&
    existing.mtime_ms === info.mtimeMs
  );
}

function existingMediaProbeMetadataPresent(existing: ExistingMediaFile) {
  return (
    existing.duration_seconds !== null ||
    existing.video_codec !== null ||
    existing.audio_codec !== null
  );
}

async function loadExistingLibraryFiles(libraryId: string) {
  const db = await getDb();
  const files = await db
    .selectFrom("media_file")
    .leftJoin("media_item", "media_item.id", "media_file.media_item_id")
    .select([
      "media_file.id",
      "media_file.library_id",
      "media_file.media_item_id",
      "media_file.path",
      "media_file.basename",
      "media_file.extension",
      "media_file.size_bytes",
      "media_file.mtime_ms",
      "media_file.duration_seconds",
      "media_file.video_codec",
      "media_file.audio_codec",
      "media_file.container",
      "media_item.provider as existing_provider"
    ])
    .where("media_file.library_id", "=", libraryId)
    .execute();
  return new Map(files.map((file) => [file.path, file]));
}

async function findOrCreateMovieItem(
  filePath: string,
  onMetadataError?: (error: unknown) => Promise<void>,
  metadataMatcher?: MovieMetadataMatcher
) {
  const db = await getDb();
  const parsed = movieLookupFromPath(filePath);
  const metadata = await lookupMovieMetadata(parsed.title, parsed.year, onMetadataError, metadataMatcher);
  const now = nowIso();

  if (metadata) {
    const existing = await db
      .selectFrom("media_item")
      .selectAll()
      .where("kind", "=", "movie")
      .where("provider", "=", metadata.provider)
      .where("provider_id", "=", metadata.providerId)
      .executeTakeFirst();

    const values = {
      ...movieMetadataValues(metadata, now),
      kind: "movie" as const,
      sort_title: sortTitle(metadata.title),
      parent_id: null,
    };

    if (existing) {
      await db.updateTable("media_item").set(values).where("id", "=", existing.id).execute();
      await syncMovieMetadataRelations(db, existing.id, metadata);
      return existing.id;
    }

    const localExisting = await db
      .selectFrom("media_item")
      .selectAll()
      .where("kind", "=", "movie")
      .where("provider", "is", null)
      .where("title", "=", parsed.title)
      .where((eb) => (parsed.year === null ? eb("year", "is", null) : eb("year", "=", parsed.year)))
      .executeTakeFirst();

    if (localExisting) {
      await db.updateTable("media_item").set(values).where("id", "=", localExisting.id).execute();
      await syncMovieMetadataRelations(db, localExisting.id, metadata);
      return localExisting.id;
    }

    const id = createId();
    await db.insertInto("media_item").values({ id, ...values, created_at: now }).execute();
    await syncMovieMetadataRelations(db, id, metadata);
    return id;
  }

  const existing = await db
    .selectFrom("media_item")
    .selectAll()
    .where("kind", "=", "movie")
    .where("title", "=", parsed.title)
    .where((eb) => (parsed.year === null ? eb("year", "is", null) : eb("year", "=", parsed.year)))
    .executeTakeFirst();
  if (existing) return existing.id;

  const id = createId();
  await db
    .insertInto("media_item")
    .values({
      id,
      kind: "movie",
      title: parsed.title,
      sort_title: sortTitle(parsed.title),
      year: parsed.year,
      release_date: parsed.year ? `${parsed.year}-01-01` : null,
      ...emptyMovieMetadataValues(),
      parent_id: null,
      created_at: now,
      updated_at: now
    })
    .execute();
  return id;
}

async function scanMovieFile(
  library: ScannableLibrary,
  filePath: string,
  fileInfo: StorageFileInfo | undefined,
  context: ScanContext,
  onMetadataError?: (error: unknown) => Promise<void>,
  metadataMatcher?: MovieMetadataMatcher
) {
  const db = await getDb();
  const info = fileInfo ?? await context.storage.statFile(filePath);
  if (!info) throw new Error("Media file is no longer available.");
  const existing = context.existingFilesByPath.get(filePath);
  const now = nowIso();
  const mediaFileId = existing?.id ?? createId();
  const skipProbe =
    existing &&
    basicFileMetadataUnchanged(existing, library, info) &&
    (context.storage.source === "sftp" || existingMediaProbeMetadataPresent(existing));
  const probed = skipProbe
    ? { probe: null, values: fileValuesFromExisting(existing) }
    : await probeScannedFile(mediaFileId, info, context);
  const fileValues = {
    library_id: library.id,
    path: filePath,
    basename: info.basename,
    extension: info.extension,
    size_bytes: info.size,
    mtime_ms: info.mtimeMs,
    ...probed.values,
    updated_at: now
  };

  if (existing) {
    const fileUnchanged =
      basicFileMetadataUnchanged(existing, library, info) &&
      existing.duration_seconds === fileValues.duration_seconds &&
      existing.video_codec === fileValues.video_codec &&
      existing.audio_codec === fileValues.audio_codec &&
      existing.container === fileValues.container;

    if (fileUnchanged && existing.existing_provider) {
      await syncSidecarSubtitleTracks(existing.media_item_id, mediaFileId, filePath, now, context);
      return "unchanged" as const;
    }

    const mediaItemId = await findOrCreateMovieItem(filePath, onMetadataError, metadataMatcher);
    const values = {
      ...fileValues,
      media_item_id: mediaItemId
    };

    if (fileUnchanged && existing.media_item_id === mediaItemId) {
      await syncSidecarSubtitleTracks(mediaItemId, mediaFileId, filePath, now, context);
      return "unchanged" as const;
    }

    await db.updateTable("media_file").set(values).where("id", "=", existing.id).execute();
    if (probed.probe) await replaceMediaStreamInfo(existing.id, probed.probe, now);
    context.existingFilesByPath.set(filePath, { ...existing, ...values, existing_provider: existing.existing_provider });
    await moveMediaFileAssociations(existing.id, existing.media_item_id, mediaItemId, now);
    await syncSidecarSubtitleTracks(mediaItemId, mediaFileId, filePath, now, context);
    return "updated" as const;
  }

  const mediaItemId = await findOrCreateMovieItem(filePath, onMetadataError, metadataMatcher);
  const values = {
    ...fileValues,
    media_item_id: mediaItemId
  };

  await db.insertInto("media_file").values({ id: mediaFileId, ...values, created_at: now }).execute();
  if (probed.probe) await replaceMediaStreamInfo(mediaFileId, probed.probe, now);
  context.existingFilesByPath.set(filePath, { id: mediaFileId, ...values, existing_provider: null });
  await syncSidecarSubtitleTracks(mediaItemId, mediaFileId, filePath, now, context);
  return "added" as const;
}

function seasonTitle(seasonNumber: number) {
  return seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
}

function episodeTitle(parsed: ParsedTvEpisode) {
  return parsed.episodeTitle || `Episode ${parsed.episodeNumber}`;
}

async function findOrCreateShowItem(parsed: ParsedTvEpisode, now: string, metadata?: MatchedTvShowMetadata) {
  const db = await getDb();
  const providerExisting = metadata
    ? await db
        .selectFrom("media_item")
        .selectAll()
        .where("kind", "=", "show")
        .where("provider", "=", metadata.provider)
        .where("provider_id", "=", metadata.providerId)
        .executeTakeFirst()
    : null;

  const localExisting = await db
    .selectFrom("media_item")
    .selectAll()
    .where("kind", "=", "show")
    .where("title", "=", parsed.showTitle)
    .$if(Boolean(metadata), (qb) => qb.where("provider", "is", null))
    .executeTakeFirst();

  const existing = providerExisting ?? localExisting;

  const values = metadata ? {
    ...tvShowMetadataValues(metadata, now),
    kind: "show" as const,
    sort_title: sortTitle(metadata.title),
    season_number: null,
    episode_number: null,
    parent_id: null
  } : {
    kind: "show" as const,
    title: parsed.showTitle,
    sort_title: sortTitle(parsed.showTitle),
    year: null,
    season_number: null,
    episode_number: null,
    release_date: null,
    ...emptyMovieMetadataValues(),
    parent_id: null,
    updated_at: now
  };

  if (existing) {
    if (metadata || !existing.provider) {
      await db.updateTable("media_item").set(values).where("id", "=", existing.id).execute();
      if (metadata) await syncTvShowMetadataRelations(db, existing.id, metadata);
    }
    return existing.id;
  }

  const id = createId();
  await db.insertInto("media_item").values({ id, ...values, created_at: now }).execute();
  if (metadata) await syncTvShowMetadataRelations(db, id, metadata);
  return id;
}

async function findOrCreateSeasonItem(showId: string, parsed: ParsedTvEpisode, now: string, metadata?: MatchedTvSeasonMetadata) {
  const db = await getDb();
  const providerExisting = metadata
    ? await db
        .selectFrom("media_item")
        .selectAll()
        .where("kind", "=", "season")
        .where("provider", "=", metadata.provider)
        .where("provider_id", "=", metadata.providerId)
        .executeTakeFirst()
    : null;
  const localExisting = await db
    .selectFrom("media_item")
    .selectAll()
    .where("kind", "=", "season")
    .where("parent_id", "=", showId)
    .where("season_number", "=", parsed.seasonNumber)
    .$if(Boolean(metadata), (qb) => qb.where("provider", "is", null))
    .executeTakeFirst();
  const existing = providerExisting ?? localExisting;

  const title = seasonTitle(parsed.seasonNumber);
  const values = metadata ? {
    ...tvSeasonMetadataValues(metadata, now),
    kind: "season" as const,
    sort_title: metadata.seasonNumber.toString().padStart(4, "0"),
    parent_id: showId
  } : {
    kind: "season" as const,
    title,
    sort_title: parsed.seasonNumber.toString().padStart(4, "0"),
    year: null,
    season_number: parsed.seasonNumber,
    episode_number: null,
    release_date: null,
    ...emptyMovieMetadataValues(),
    parent_id: showId,
    updated_at: now
  };

  if (existing) {
    if (metadata || !existing.provider) {
      await db.updateTable("media_item").set(values).where("id", "=", existing.id).execute();
    }
    return existing.id;
  }

  const id = createId();
  await db.insertInto("media_item").values({ id, ...values, created_at: now }).execute();
  return id;
}

function tvSeasonMetadataCacheKey(parsed: ParsedTvEpisode) {
  return `${parsed.showTitle.toLowerCase()}:s${parsed.seasonNumber}`;
}

function episodeSortTitle(seasonNumber: number, episodeNumber: number) {
  return `s${seasonNumber.toString().padStart(3, "0")}e${episodeNumber.toString().padStart(4, "0")}`;
}

async function lookupCachedTvSeasonMetadata(
  parsed: ParsedTvEpisode,
  cache: Map<string, Promise<MatchedTvSeasonLookup | null>>,
  onMetadataError?: (error: unknown) => Promise<void>,
  tvSeasonMetadataMatcher?: TvSeasonMetadataMatcher
) {
  const key = tvSeasonMetadataCacheKey(parsed);
  const existing = cache.get(key);
  if (existing) return existing;

  const lookup = lookupTvSeasonMetadata(parsed.showTitle, null, parsed.seasonNumber, onMetadataError, tvSeasonMetadataMatcher);
  cache.set(key, lookup);
  return lookup;
}

async function findOrCreateEpisodeMetadataItem(seasonId: string, metadata: MatchedTvEpisodeMetadata, now: string) {
  const db = await getDb();
  const providerExisting = await db
    .selectFrom("media_item")
    .selectAll()
    .where("kind", "=", "episode")
    .where("provider", "=", metadata.provider)
    .where("provider_id", "=", metadata.providerId)
    .executeTakeFirst();
  const localExisting = await db
    .selectFrom("media_item")
    .selectAll()
    .where("kind", "=", "episode")
    .where("parent_id", "=", seasonId)
    .where("season_number", "=", metadata.seasonNumber)
    .where("episode_number", "=", metadata.episodeNumber)
    .where("provider", "is", null)
    .executeTakeFirst();
  const existing = providerExisting ?? localExisting;
  const values = {
    ...tvEpisodeMetadataValues(metadata, now),
    kind: "episode" as const,
    sort_title: episodeSortTitle(metadata.seasonNumber, metadata.episodeNumber),
    parent_id: seasonId
  };

  if (existing) {
    await db.updateTable("media_item").set(values).where("id", "=", existing.id).execute();
    return existing.id;
  }

  const id = createId();
  await db.insertInto("media_item").values({ id, ...values, created_at: now }).execute();
  return id;
}

async function syncTvSeasonEpisodeMetadata(
  seasonId: string,
  episodes: MatchedTvEpisodeMetadata[],
  now: string,
  context: ScanContext
) {
  if (episodes.length === 0) return;
  const key = `${seasonId}:${episodes.map((episode) => `${episode.provider}:${episode.providerId}`).join(",")}`;
  const existing = context.tvSeasonEpisodeSyncCache.get(key);
  if (existing) {
    await existing;
    return;
  }

  const sync = (async () => {
    for (const episode of episodes) {
      await findOrCreateEpisodeMetadataItem(seasonId, episode, now);
    }
  })();
  context.tvSeasonEpisodeSyncCache.set(key, sync);
  await sync;
}

async function findOrCreateEpisodeItem(
  filePath: string,
  root: string | undefined,
  tvSeasonMetadataCache: Map<string, Promise<MatchedTvSeasonLookup | null>>,
  context: ScanContext,
  preferredExistingMediaItemId?: string,
  onMetadataError?: (error: unknown) => Promise<void>,
  tvSeasonMetadataMatcher?: TvSeasonMetadataMatcher
) {
  const parsed = parseTvEpisodePath(filePath, root);
  if (!parsed) throw new Error("Could not parse TV episode filename.");

  const db = await getDb();
  const now = nowIso();
  const metadata = await lookupCachedTvSeasonMetadata(parsed, tvSeasonMetadataCache, onMetadataError, tvSeasonMetadataMatcher);
  if (!metadata && preferredExistingMediaItemId) return preferredExistingMediaItemId;

  const showId = await findOrCreateShowItem(parsed, now, metadata?.show);
  const seasonId = await findOrCreateSeasonItem(showId, parsed, now, metadata?.season);
  if (metadata) {
    await syncTvSeasonEpisodeMetadata(seasonId, metadata.episodes, now, context);
  }

  const episodeMetadata = metadata?.episodes.find((episode) => episode.episodeNumber === parsed.episodeNumber) ?? null;
  if (episodeMetadata) {
    return findOrCreateEpisodeMetadataItem(seasonId, episodeMetadata, now);
  }

  const title = episodeTitle(parsed);
  const localExisting = await db
    .selectFrom("media_item")
    .selectAll()
    .where("kind", "=", "episode")
    .where("parent_id", "=", seasonId)
    .where("season_number", "=", parsed.seasonNumber)
    .where("episode_number", "=", parsed.episodeNumber)
    .executeTakeFirst();
  const values = {
    kind: "episode" as const,
    title,
    sort_title: episodeSortTitle(parsed.seasonNumber, parsed.episodeNumber),
    year: null,
    season_number: parsed.seasonNumber,
    episode_number: parsed.episodeNumber,
    release_date: null,
    ...emptyMovieMetadataValues(),
    parent_id: seasonId,
    updated_at: now
  };

  if (localExisting) {
    if (!localExisting.provider) {
      await db.updateTable("media_item").set(values).where("id", "=", localExisting.id).execute();
    }
    return localExisting.id;
  }

  const id = createId();
  await db.insertInto("media_item").values({ id, ...values, created_at: now }).execute();
  return id;
}

async function scanTvFile(
  library: ScannableLibrary,
  filePath: string,
  fileInfo: StorageFileInfo | undefined,
  context: ScanContext,
  onMetadataError?: (error: unknown) => Promise<void>,
  _metadataMatcher?: MovieMetadataMatcher,
  tvSeasonMetadataMatcher?: TvSeasonMetadataMatcher
) {
  const db = await getDb();
  const info = fileInfo ?? await context.storage.statFile(filePath);
  if (!info) throw new Error("Media file is no longer available.");
  const existing = context.existingFilesByPath.get(filePath);
  const now = nowIso();
  const mediaFileId = existing?.id ?? createId();
  const skipProbe =
    existing &&
    basicFileMetadataUnchanged(existing, library, info) &&
    (context.storage.source === "sftp" || existingMediaProbeMetadataPresent(existing));
  const probed = skipProbe
    ? { probe: null, values: fileValuesFromExisting(existing) }
    : await probeScannedFile(mediaFileId, info, context);
  const fileValues = {
    library_id: library.id,
    path: filePath,
    basename: info.basename,
    extension: info.extension,
    size_bytes: info.size,
    mtime_ms: info.mtimeMs,
    ...probed.values,
    updated_at: now
  };

  if (existing) {
    const fileUnchanged =
      basicFileMetadataUnchanged(existing, library, info) &&
      existing.duration_seconds === fileValues.duration_seconds &&
      existing.video_codec === fileValues.video_codec &&
      existing.audio_codec === fileValues.audio_codec &&
      existing.container === fileValues.container;

    const mediaItemId = await findOrCreateEpisodeItem(
      filePath,
      context.storage.root ?? library.path,
      context.tvSeasonMetadataCache,
      context,
      existing.existing_provider ? existing.media_item_id : undefined,
      onMetadataError,
      tvSeasonMetadataMatcher
    );
    const values = {
      ...fileValues,
      media_item_id: mediaItemId
    };

    if (fileUnchanged && existing.media_item_id === mediaItemId) {
      await syncSidecarSubtitleTracks(mediaItemId, mediaFileId, filePath, now, context);
      return "unchanged" as const;
    }

    await db.updateTable("media_file").set(values).where("id", "=", existing.id).execute();
    if (probed.probe) await replaceMediaStreamInfo(existing.id, probed.probe, now);
    context.existingFilesByPath.set(filePath, { ...existing, ...values, existing_provider: existing.existing_provider });
    await moveMediaFileAssociations(existing.id, existing.media_item_id, mediaItemId, now);
    await syncSidecarSubtitleTracks(mediaItemId, mediaFileId, filePath, now, context);
    return "updated" as const;
  }

  const mediaItemId = await findOrCreateEpisodeItem(
    filePath,
    context.storage.root ?? library.path,
    context.tvSeasonMetadataCache,
    context,
    undefined,
    onMetadataError,
    tvSeasonMetadataMatcher
  );
  const values = {
    ...fileValues,
    media_item_id: mediaItemId
  };

  await db.insertInto("media_file").values({ id: mediaFileId, ...values, created_at: now }).execute();
  if (probed.probe) await replaceMediaStreamInfo(mediaFileId, probed.probe, now);
  context.existingFilesByPath.set(filePath, { id: mediaFileId, ...values, existing_provider: null });
  await syncSidecarSubtitleTracks(mediaItemId, mediaFileId, filePath, now, context);
  return "added" as const;
}

async function moveMediaFileAssociations(fileId: string, oldMediaItemId: string, newMediaItemId: string, now: string) {
  if (oldMediaItemId === newMediaItemId) return;

  const db = await getDb();
  const progressRows = await db
    .selectFrom("watch_progress")
    .selectAll()
    .where("media_file_id", "=", fileId)
    .where("media_item_id", "=", oldMediaItemId)
    .execute();

  for (const progress of progressRows) {
    const existingProgress = await db
      .selectFrom("watch_progress")
      .selectAll()
      .where("user_id", "=", progress.user_id)
      .where("media_item_id", "=", newMediaItemId)
      .where("media_file_id", "=", fileId)
      .executeTakeFirst();

    if (existingProgress) {
      if (new Date(progress.updated_at).getTime() >= new Date(existingProgress.updated_at).getTime()) {
        await db
          .updateTable("watch_progress")
          .set({
            position_seconds: progress.position_seconds,
            duration_seconds: progress.duration_seconds,
            completed: progress.completed,
            updated_at: progress.updated_at
          })
          .where("user_id", "=", progress.user_id)
          .where("media_item_id", "=", newMediaItemId)
          .where("media_file_id", "=", fileId)
          .execute();
      }

      await db
        .deleteFrom("watch_progress")
        .where("user_id", "=", progress.user_id)
        .where("media_item_id", "=", oldMediaItemId)
        .where("media_file_id", "=", fileId)
        .execute();
    } else {
      await db
        .updateTable("watch_progress")
        .set({ media_item_id: newMediaItemId })
        .where("user_id", "=", progress.user_id)
        .where("media_item_id", "=", oldMediaItemId)
        .where("media_file_id", "=", fileId)
        .execute();
    }
  }

  await db
    .updateTable("subtitle_track")
    .set({ media_item_id: newMediaItemId, updated_at: now })
    .where("media_file_id", "=", fileId)
    .where("media_item_id", "=", oldMediaItemId)
    .execute();

  await sql`
    delete from media_item
    where id = ${oldMediaItemId}
      and provider is null
      and not exists (
        select 1
        from media_file
        where media_file.media_item_id = media_item.id
      )
  `.execute(db);
  await deleteOrphanTvContainers();
}

function sidecarSubtitleMatch(videoPath: string, subtitlePath: string) {
  const video = path.parse(videoPath);
  const subtitle = path.parse(subtitlePath);
  if (!isSidecarSubtitlePath(subtitlePath)) return false;
  if (path.dirname(subtitlePath) !== path.dirname(videoPath)) return false;
  return subtitle.name === video.name || subtitle.name.startsWith(`${video.name}.`) || subtitle.name.startsWith(`${video.name}-`) || subtitle.name.startsWith(`${video.name}_`);
}

function sidecarSubtitleMetadata(videoPath: string, subtitlePath: string, index: number) {
  const video = path.parse(videoPath);
  const subtitle = path.parse(subtitlePath);
  const suffix = subtitle.name
    .slice(video.name.length)
    .replace(/^[._-]+/, "")
    .replace(/[._-]+/g, " ")
    .trim();
  const label = suffix || "Default";
  const language = (suffix.split(/\s+/)[0] || "und").toLowerCase();

  return {
    label,
    language,
    isDefault: suffix.length === 0 || index === 0
  };
}

async function readCachedDirectoryEntries(directory: string, context: ScanContext) {
  if (context.directoryEntryCache.has(directory)) {
    return context.directoryEntryCache.get(directory) ?? { ok: false, paths: [] };
  }

  const result = await context.directoryFileReader(directory);
  context.directoryEntryCache.set(directory, result);
  return result;
}

function defaultDirectoryFileReader(storage: LibraryStorage) {
  return async (directory: string) => {
    const entries = await storage.listFiles(directory);
    return entries ? { ok: true, paths: entries.map((entry) => entry.path) } : { ok: false, paths: [] };
  };
}

function cacheWalkDirectoryEntry(entry: Extract<StorageWalkEntry, { kind: "directory" }>, context: ScanContext) {
  context.directoryEntryCache.set(entry.path, { ok: true, paths: entry.files.map((file) => file.path) });
  const videoCount = entry.files.filter((file) => isVideoFilePath(file.path)).length;
  if (videoCount > 0) {
    context.directoryVideoCounts.set(entry.path, videoCount);
  } else {
    context.directoryEntryCache.delete(entry.path);
  }
}

function releaseWalkDirectoryFile(filePath: string, context: ScanContext) {
  const directory = path.dirname(filePath);
  const remaining = context.directoryVideoCounts.get(directory);
  if (remaining === undefined) return;
  if (remaining > 1) {
    context.directoryVideoCounts.set(directory, remaining - 1);
    return;
  }

  context.directoryVideoCounts.delete(directory);
  context.directoryEntryCache.delete(directory);
}

async function findSidecarSubtitleFiles(videoPath: string, context: ScanContext) {
  const directory = path.dirname(videoPath);
  const result = await readCachedDirectoryEntries(directory, context);
  if (!result.ok) return null;
  return result.paths
    .filter((subtitlePath) => sidecarSubtitleMatch(videoPath, subtitlePath))
    .sort((left, right) => left.localeCompare(right));
}

async function syncSidecarSubtitleTracks(mediaItemId: string, mediaFileId: string, filePath: string, now: string, context: ScanContext) {
  const db = await getDb();
  const subtitlePaths = await findSidecarSubtitleFiles(filePath, context);
  if (!subtitlePaths) return;
  const seenPaths = new Set(subtitlePaths);

  for (const [index, subtitlePath] of subtitlePaths.entries()) {
    const metadata = sidecarSubtitleMetadata(filePath, subtitlePath, index);
    const values = {
      media_item_id: mediaItemId,
      media_file_id: mediaFileId,
      label: metadata.label,
      language: metadata.language,
      source_kind: "external" as const,
      path: subtitlePath,
      mime_type: "text/vtt",
      is_default: metadata.isDefault ? 1 : 0,
      updated_at: now
    };
    const existing = await db
      .selectFrom("subtitle_track")
      .select("id")
      .where("media_file_id", "=", mediaFileId)
      .where("source_kind", "=", "external")
      .where("path", "=", subtitlePath)
      .executeTakeFirst();

    if (existing) {
      await db.updateTable("subtitle_track").set(values).where("id", "=", existing.id).execute();
    } else {
      await db
        .insertInto("subtitle_track")
        .values({ id: createId(), ...values, created_at: now })
        .execute();
    }
  }

  const existingSidecars = await db
    .selectFrom("subtitle_track")
    .select(["id", "path"])
    .where("media_file_id", "=", mediaFileId)
    .where("source_kind", "=", "external")
    .where("path", "is not", null)
    .execute();

  const staleIds = existingSidecars
    .filter((track) => track.path && sidecarSubtitleMatch(filePath, track.path) && !seenPaths.has(track.path))
    .map((track) => track.id);
  if (staleIds.length > 0) {
    await db.deleteFrom("subtitle_track").where("id", "in", staleIds).execute();
  }
}

const LIBRARY_SCAN_HANDLERS: Partial<Record<LibraryKind, LibraryScanHandler>> = {
  movie: {
    mediaKind: "movie",
    scanFile: scanMovieFile
  },
  tv: {
    mediaKind: "episode",
    scanFile: scanTvFile
  }
};

function getLibraryScanHandler(kind: LibraryKind) {
  const handler = LIBRARY_SCAN_HANDLERS[kind];
  if (!handler) throw new Error(`Scanning ${kind} libraries is not implemented.`);
  return handler;
}

async function pruneMissingLibraryFiles(library: ScannableLibrary, seenPaths: Set<string>, mediaKind: MediaKind) {
  const db = await getDb();
  const existingFiles = await db
    .selectFrom("media_file")
    .select(["id", "media_item_id", "path"])
    .where("library_id", "=", library.id)
    .execute();
  const missingFiles = existingFiles.filter((file) => !seenPaths.has(file.path));
  const missingFileIds = missingFiles.map((file) => file.id);
  const affectedMediaItemIds = [...new Set(missingFiles.map((file) => file.media_item_id))];

  if (missingFileIds.length > 0) {
    await db.deleteFrom("media_file").where("id", "in", missingFileIds).execute();
    await db
      .deleteFrom("media_item")
      .where("id", "in", affectedMediaItemIds)
      .where("kind", "=", mediaKind)
      .$if(mediaKind === "episode", (qb) => qb.where("provider", "is", null))
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom("media_file")
              .select("media_file.id")
              .whereRef("media_file.media_item_id", "=", "media_item.id")
          )
        )
      )
      .execute();

    if (mediaKind === "episode") {
      await deleteOrphanTvContainers();
    }
  }

  return missingFileIds.length;
}

async function deleteOrphanTvContainers() {
  const db = await getDb();
  await db
    .deleteFrom("media_item")
    .where("kind", "=", "season")
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("media_item as child")
            .select("child.id")
            .whereRef("child.parent_id", "=", "media_item.id")
        )
      )
    )
    .execute();

  await db
    .deleteFrom("media_item")
    .where("kind", "=", "show")
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("media_item as child")
            .select("child.id")
            .whereRef("child.parent_id", "=", "media_item.id")
        )
      )
    )
    .execute();
}

export async function createScanJob(libraryId: string) {
  const db = await getDb();
  const now = nowIso();
  const id = createId();
  await db
    .insertInto("scan_job")
    .values({
      id,
      job_kind: "library_scan",
      library_id: libraryId,
      status: "queued",
      started_at: null,
      finished_at: null,
      files_seen: 0,
      files_added: 0,
      files_updated: 0,
      files_removed: 0,
      errors_count: 0,
      cancel_requested_at: null,
      rescan_requested_at: null,
      checkpoint_value: null,
      runner_token: null,
      runner_heartbeat_at: null,
      created_at: now,
      updated_at: now
    })
    .execute();
  return id;
}

async function getActiveScanJobId(libraryId: string) {
  const db = await getDb();
  const activeJob = await db
    .selectFrom("scan_job")
    .select("id")
    .where("library_id", "=", libraryId)
    .where("status", "in", ["queued", "running"])
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  return activeJob?.id ?? null;
}

async function isScanCancellationRequested(jobId: string) {
  const db = await getDb();
  const job = await db
    .selectFrom("scan_job")
    .select("cancel_requested_at")
    .where("id", "=", jobId)
    .executeTakeFirst();
  return Boolean(job?.cancel_requested_at);
}

async function markScanJobRunning(jobId: string, runnerToken: string) {
  const db = await getDb();
  const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirst();
  if (!job?.library_id) throw new Error("Scan job has no library.");
  if (job.status !== "queued" && job.status !== "running") return null;

  const now = nowIso();
  const isResume = job.status === "running" && job.checkpoint_value !== null;
  const result = await db
    .updateTable("scan_job")
    .set({
      status: "running",
      started_at: job.started_at ?? now,
      finished_at: null,
      ...(isResume
        ? {}
        : {
            files_seen: 0,
            files_added: 0,
            files_updated: 0,
            files_removed: 0,
            errors_count: 0,
            checkpoint_value: null
          }),
      runner_token: runnerToken,
      runner_heartbeat_at: now,
      updated_at: now
    })
    .where("id", "=", jobId)
    .where("status", "in", ["queued", "running"])
    .where("runner_token", "is", null)
    .executeTakeFirst();

  if (result.numUpdatedRows === 0n) return null;
  if (!isResume) await db.deleteFrom("scan_job_error").where("scan_job_id", "=", jobId).execute();
  return {
    ...job,
    library_id: job.library_id,
    files_seen: isResume ? job.files_seen : 0,
    files_added: isResume ? job.files_added : 0,
    files_updated: isResume ? job.files_updated : 0,
    files_removed: isResume ? job.files_removed : 0,
    errors_count: isResume ? job.errors_count : 0,
    checkpoint_value: isResume ? job.checkpoint_value : null
  };
}

async function requestRescanForActiveJob(jobId: string) {
  const db = await getDb();
  const now = nowIso();
  const result = await db
    .updateTable("scan_job")
    .set({ rescan_requested_at: now, updated_at: now })
    .where("id", "=", jobId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();
  return result.numUpdatedRows > 0n;
}

async function activeJobHasRescanRequest(jobId: string) {
  const db = await getDb();
  const job = await db
    .selectFrom("scan_job")
    .select("rescan_requested_at")
    .where("id", "=", jobId)
    .executeTakeFirst();
  return Boolean(job?.rescan_requested_at);
}

async function startFollowUpScanIfRequested(jobId: string, libraryId: string, options: ScanOptions) {
  if (!(await activeJobHasRescanRequest(jobId))) return;
  try {
    const nextJobId = await createScanJob(libraryId);
    void runScanJob(nextJobId, options);
  } catch (error) {
    const activeJobId = await getActiveScanJobId(libraryId);
    if (activeJobId) {
      await requestRescanForActiveJob(activeJobId);
      return;
    }

    console.error(`Could not start follow-up scan for library ${libraryId}:`, error);
  }
}

export async function cancelScanJob(jobId: string) {
  const db = await getDb();
  const job = await db
    .selectFrom("scan_job")
    .select(["id", "status"])
    .where("id", "=", jobId)
    .executeTakeFirst();

  if (!job) return "missing" as const;
  if (job.status !== "queued" && job.status !== "running") return "inactive" as const;

  if (job.status === "queued") {
    const now = nowIso();
    const result = await db
      .updateTable("scan_job")
      .set({ status: "cancelled", finished_at: now, updated_at: now })
      .where("id", "=", jobId)
      .where("status", "=", "queued")
      .executeTakeFirst();

    if (result.numUpdatedRows > 0n) {
      return "cancelled" as const;
    }
  }

  await db
    .updateTable("scan_job")
    .set({ cancel_requested_at: nowIso(), updated_at: nowIso() })
    .where("id", "=", jobId)
    .where("status", "=", "running")
    .execute();

  return "requested" as const;
}

async function failInterruptedJob(jobId: string, error: Error) {
  const db = await getDb();
  await addJobError(jobId, "job", error);
  await db
    .updateTable("scan_job")
    .set({
      status: "failed",
      finished_at: nowIso(),
      errors_count: 1,
      checkpoint_value: null,
      runner_token: null,
      runner_heartbeat_at: null,
      updated_at: nowIso()
    })
    .where("id", "=", jobId)
    .where("status", "in", ["queued", "running"])
    .execute();
}

async function clearActiveJobLeases() {
  const db = await getDb();
  await db
    .updateTable("scan_job")
    .set({ runner_token: null, runner_heartbeat_at: null, updated_at: nowIso() })
    .where("status", "in", ["queued", "running"])
    .execute();
}

export async function resumeInterruptedJobs(options: ResumeInterruptedJobsOptions = {}) {
  const db = await getDb();
  await clearActiveJobLeases();
  const activeJobs = await db
    .selectFrom("scan_job")
    .select(["id", "job_kind", "library_id"])
    .where("status", "in", ["queued", "running"])
    .orderBy("created_at", "asc")
    .execute();

  let resumed = 0;
  let failed = 0;

  for (const job of activeJobs) {
    if (job.job_kind === "library_scan") {
      if (!job.library_id) {
        failed += 1;
        await failInterruptedJob(job.id, new Error("Library scan job has no library."));
        continue;
      }

      resumed += 1;
      void runScanJob(job.id, options.scanOptions);
      continue;
    }

    if (job.job_kind === "movie_metadata_refresh") {
      resumed += 1;
      void runMovieMetadataRefreshJob(job.id, options.movieMetadataOptions);
      continue;
    }

    if (job.job_kind === "tv_metadata_refresh") {
      resumed += 1;
      void runTvMetadataRefreshJob(job.id, options.tvMetadataOptions);
      continue;
    }

    if (job.job_kind === "media_probe_refresh") {
      resumed += 1;
      void runMediaProbeRefreshJob(job.id, options.mediaProbeOptions);
      continue;
    }

    failed += 1;
    await failInterruptedJob(job.id, new Error(`Unknown job kind: ${job.job_kind}`));
  }

  return { resumed, failed };
}

export async function runScanJob(jobId: string, options: ScanOptions = {}) {
  if (runningScanJobs.has(jobId)) return;
  runningScanJobs.add(jobId);

  let filesSeen = 0;
  let filesAdded = 0;
  let filesUpdated = 0;
  let filesRemoved = 0;
  let errorsCount = 0;
  let errorPath = "scan";
  let traversalHadErrors = false;
  let fileProcessingHadErrors = false;
  let cancelled = false;
  let runningLibraryId: string | null = null;
  const seenPaths = new Set<string>();
  let resumeCheckpoint: string | null = null;
  let waitingForCheckpoint = false;
  let storage: LibraryStorage | undefined;
  const runnerToken = createId();

  try {
    const job = await markScanJobRunning(jobId, runnerToken);
    if (!job) return;

    filesSeen = job.files_seen;
    filesAdded = job.files_added;
    filesUpdated = job.files_updated;
    filesRemoved = job.files_removed;
    errorsCount = job.errors_count;
    resumeCheckpoint = job.checkpoint_value;
    waitingForCheckpoint = resumeCheckpoint !== null;
    if (resumeCheckpoint && errorsCount > 0) traversalHadErrors = true;
    errorPath = job.library_id;
    runningLibraryId = job.library_id;
    const library = await getLibrary(job.library_id);
    if (!library) throw new Error("Library not found.");
    errorPath = library.path;
    const scanHandler = getLibraryScanHandler(library.kind);
    storage = options.storage ?? await createLibraryStorage(library);
    const context: ScanContext = {
      directoryEntryCache: new Map(),
      directoryVideoCounts: new Map(),
      directoryFileReader: options.directoryFileReader ?? defaultDirectoryFileReader(storage),
      existingFilesByPath: await loadExistingLibraryFiles(library.id),
      tvSeasonMetadataCache: new Map(),
      tvSeasonEpisodeSyncCache: new Map(),
      probeBackend: options.probeBackend === undefined ? nodeAvBackend : options.probeBackend,
      storage
    };
    const fileWalker = options.fileWalker ?? storage.walkFiles;
    for await (const entry of fileWalker(storage.root ?? library.path)) {
      if (await isScanCancellationRequested(jobId)) {
        cancelled = true;
        break;
      }

      if (entry.kind === "error") {
        traversalHadErrors = true;
        errorsCount += 1;
        await addJobError(jobId, entry.path, entry.error);
        await updateJob(jobId, {
          files_seen: filesSeen,
          files_added: filesAdded,
          files_updated: filesUpdated,
          errors_count: errorsCount
        }, runnerToken);
        continue;
      }

      if (entry.kind === "directory") {
        cacheWalkDirectoryEntry(entry, context);
        continue;
      }

      const filePath = entry.path;
      if (!isVideoFilePath(filePath)) continue;
      if (waitingForCheckpoint) {
        seenPaths.add(filePath);
        if (filePath === resumeCheckpoint) waitingForCheckpoint = false;
        releaseWalkDirectoryFile(filePath, context);
        continue;
      }

      filesSeen += 1;
      let processedSuccessfully = false;
      try {
        const result = await scanHandler.scanFile(library, filePath, entry.file, context, async (error) => {
          await addJobError(jobId, filePath, error);
          errorsCount += 1;
        }, options.metadataMatcher, options.tvSeasonMetadataMatcher);
        seenPaths.add(filePath);
        if (result === "added") filesAdded += 1;
        if (result === "updated") filesUpdated += 1;
        processedSuccessfully = true;
      } catch (error) {
        fileProcessingHadErrors = true;
        errorsCount += 1;
        await addJobError(jobId, filePath, error);
      }

      await updateJob(jobId, {
        files_seen: filesSeen,
        files_added: filesAdded,
        files_updated: filesUpdated,
        errors_count: errorsCount,
        ...(processedSuccessfully ? { checkpoint_value: filePath } : {})
      }, runnerToken);
      releaseWalkDirectoryFile(filePath, context);
    }

    if (waitingForCheckpoint) {
      throw new Error(`Scan checkpoint was not found: ${resumeCheckpoint}`);
    }

    if (cancelled || await isScanCancellationRequested(jobId)) {
      await updateJob(jobId, {
        status: "cancelled",
        finished_at: nowIso(),
        files_seen: filesSeen,
        files_added: filesAdded,
        files_updated: filesUpdated,
        errors_count: errorsCount
      }, runnerToken);
      return;
    }

    if (!traversalHadErrors && !fileProcessingHadErrors) {
      filesRemoved = await pruneMissingLibraryFiles(library, seenPaths, scanHandler.mediaKind);
    }

    await updateJob(jobId, {
      status: "completed",
      finished_at: nowIso(),
      files_seen: filesSeen,
      files_added: filesAdded,
      files_updated: filesUpdated,
      files_removed: filesRemoved,
      errors_count: errorsCount
    }, runnerToken);
    await startFollowUpScanIfRequested(jobId, library.id, options);
  } catch (error) {
    if (await isScanCancellationRequested(jobId)) {
      await updateJob(jobId, {
        status: "cancelled",
        finished_at: nowIso(),
        files_seen: filesSeen,
        files_added: filesAdded,
        files_updated: filesUpdated,
        errors_count: errorsCount
      }, runnerToken);
      return;
    }

    errorsCount += 1;
    await addJobError(jobId, errorPath, error);
    await updateJob(jobId, {
      status: "failed",
      finished_at: nowIso(),
      errors_count: errorsCount
    }, runnerToken);
    if (runningLibraryId) await startFollowUpScanIfRequested(jobId, runningLibraryId, options);
  } finally {
    try {
      await storage?.close();
    } catch (error) {
      console.error(`Could not close scan storage for job ${jobId}:`, error);
    }
    runningScanJobs.delete(jobId);
  }
}

export async function startScan(libraryId: string, options: ScanOptions = {}) {
  const library = await getLibrary(libraryId);
  if (!library) throw new Error("Library not found.");

  const activeJobId = await getActiveScanJobId(libraryId);
  if (activeJobId && await requestRescanForActiveJob(activeJobId)) return activeJobId;

  let jobId: string;
  try {
    jobId = await createScanJob(libraryId);
  } catch (error) {
    const existingJobId = await getActiveScanJobId(libraryId);
    if (existingJobId) return existingJobId;
    throw error;
  }

  void runScanJob(jobId, options);
  return jobId;
}

export async function startAllMovieScans(options: ScanOptions = {}) {
  const libraries = (await listLibraries()).filter((library) => library.kind === "movie");
  const jobIds: string[] = [];

  for (const library of libraries) {
    jobIds.push(await startScan(library.id, options));
  }

  return {
    libraries: libraries.length,
    jobIds
  };
}

export async function startAllTvScans(options: ScanOptions = {}) {
  const libraries = (await listLibraries()).filter((library) => library.kind === "tv");
  const jobIds: string[] = [];

  for (const library of libraries) {
    jobIds.push(await startScan(library.id, options));
  }

  return {
    libraries: libraries.length,
    jobIds
  };
}

export async function startAllLibraryScans(options: ScanOptions = {}) {
  const libraries = (await listLibraries()).filter((library) => Boolean(LIBRARY_SCAN_HANDLERS[library.kind]));
  const jobIds: string[] = [];

  for (const library of libraries) {
    jobIds.push(await startScan(library.id, options));
  }

  return {
    libraries: libraries.length,
    jobIds
  };
}
