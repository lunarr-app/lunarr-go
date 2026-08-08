import { getDb } from "../db";
import { createId } from "../id";
import { nowIso } from "../time";
import { isRemoteLibrarySource } from "../libraries/source";
import {
  emptyMovieMetadataValues,
  syncMediaMetadataRelations,
  tvEpisodeMetadataValues,
  tvSeasonMetadataValues,
  tvShowMetadataValues,
} from "../metadata/store";
import type {
  MatchedTvEpisodeMetadata,
  MatchedTvSeasonLookup,
  MatchedTvSeasonMetadata,
  MatchedTvShowMetadata,
} from "../metadata/tmdb";
import { lookupTvSeasonMetadata, type MovieMetadataMatcher, type TvSeasonMetadataMatcher } from "../metadata/matching";
import { moveEpisodeAssociations } from "../metadata/tv";
import type { StorageFileInfo } from "../storage";
import { replaceMediaStreamInfo } from "../transcoding/probe";
import { sortTitle } from "./scan-movies";
import {
  basicFileMetadataUnchanged,
  existingMediaProbeMetadataPresent,
  fileValuesFromExisting,
  moveMediaFileAssociations,
  probeScannedFile,
} from "./scan-context";
import { syncSidecarSubtitleTracks } from "./scan-subtitles";
import type { ScanContext, ScannableLibrary } from "./scan-types";
import { parseTvEpisodePath, type ParsedTvEpisode } from "./tv-parser";

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

  const values = metadata
    ? {
        ...tvShowMetadataValues(metadata, now),
        kind: "show" as const,
        sort_title: sortTitle(metadata.title),
        season_number: null,
        episode_number: null,
        parent_id: null,
      }
    : {
        kind: "show" as const,
        title: parsed.showTitle,
        sort_title: sortTitle(parsed.showTitle),
        year: null,
        season_number: null,
        episode_number: null,
        release_date: null,
        ...emptyMovieMetadataValues(),
        parent_id: null,
        updated_at: now,
      };

  if (existing) {
    if (metadata || !existing.provider) {
      await db.updateTable("media_item").set(values).where("id", "=", existing.id).execute();
      if (metadata) await syncMediaMetadataRelations(db, existing.id, metadata);
    }
    return existing.id;
  }

  const id = createId();
  await db
    .insertInto("media_item")
    .values({ id, ...values, created_at: now })
    .execute();
  if (metadata) await syncMediaMetadataRelations(db, id, metadata);
  return id;
}

async function findOrCreateSeasonItem(
  showId: string,
  parsed: ParsedTvEpisode,
  now: string,
  metadata?: MatchedTvSeasonMetadata,
) {
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
  const values = metadata
    ? {
        ...tvSeasonMetadataValues(metadata, now),
        kind: "season" as const,
        sort_title: metadata.seasonNumber.toString().padStart(4, "0"),
        parent_id: showId,
      }
    : {
        kind: "season" as const,
        title,
        sort_title: parsed.seasonNumber.toString().padStart(4, "0"),
        year: null,
        season_number: parsed.seasonNumber,
        episode_number: null,
        release_date: null,
        ...emptyMovieMetadataValues(),
        parent_id: showId,
        updated_at: now,
      };

  if (existing) {
    if (metadata || !existing.provider) {
      await db.updateTable("media_item").set(values).where("id", "=", existing.id).execute();
    }
    return existing.id;
  }

  const id = createId();
  await db
    .insertInto("media_item")
    .values({ id, ...values, created_at: now })
    .execute();
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
  tvSeasonMetadataMatcher?: TvSeasonMetadataMatcher,
) {
  const key = tvSeasonMetadataCacheKey(parsed);
  const existing = cache.get(key);
  if (existing) return existing;

  const lookup = lookupTvSeasonMetadata(
    parsed.showTitle,
    parsed.year,
    parsed.seasonNumber,
    onMetadataError,
    tvSeasonMetadataMatcher,
  );
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
  const libraryExisting = await db
    .selectFrom("media_item")
    .selectAll()
    .where("kind", "=", "episode")
    .where("parent_id", "=", seasonId)
    .where("season_number", "=", metadata.seasonNumber)
    .where("episode_number", "=", metadata.episodeNumber)
    .executeTakeFirst();
  const values = {
    ...tvEpisodeMetadataValues(metadata, now),
    kind: "episode" as const,
    sort_title: episodeSortTitle(metadata.seasonNumber, metadata.episodeNumber),
    parent_id: seasonId,
  };

  if (providerExisting) {
    await db.updateTable("media_item").set(values).where("id", "=", providerExisting.id).execute();
    if (libraryExisting && libraryExisting.id !== providerExisting.id) {
      await moveEpisodeAssociations(libraryExisting.id, providerExisting.id, now);
    }
    return providerExisting.id;
  }

  if (libraryExisting) {
    await db.updateTable("media_item").set(values).where("id", "=", libraryExisting.id).execute();
    return libraryExisting.id;
  }

  const id = createId();
  await db
    .insertInto("media_item")
    .values({ id, ...values, created_at: now })
    .execute();
  return id;
}

async function syncTvSeasonEpisodeMetadata(
  seasonId: string,
  episodes: MatchedTvEpisodeMetadata[],
  now: string,
  context: ScanContext,
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
  tvSeasonMetadataMatcher?: TvSeasonMetadataMatcher,
) {
  const parsed = parseTvEpisodePath(filePath, root);
  if (!parsed) throw new Error("Could not parse TV episode filename.");

  const db = await getDb();
  const now = nowIso();
  const metadata = await lookupCachedTvSeasonMetadata(
    parsed,
    tvSeasonMetadataCache,
    onMetadataError,
    tvSeasonMetadataMatcher,
  );
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
    updated_at: now,
  };

  if (localExisting) {
    if (!localExisting.provider) {
      await db.updateTable("media_item").set(values).where("id", "=", localExisting.id).execute();
    }
    return localExisting.id;
  }

  const id = createId();
  await db
    .insertInto("media_item")
    .values({ id, ...values, created_at: now })
    .execute();
  return id;
}

export async function scanTvFile(
  library: ScannableLibrary,
  filePath: string,
  fileInfo: StorageFileInfo | undefined,
  context: ScanContext,
  onMetadataError?: (error: unknown) => Promise<void>,
  _metadataMatcher?: MovieMetadataMatcher,
  tvSeasonMetadataMatcher?: TvSeasonMetadataMatcher,
) {
  const db = await getDb();
  const info = fileInfo ?? (await context.storage.statFile(filePath));
  if (!info) throw new Error("Media file is no longer available.");
  const existing = context.existingFilesByPath.get(filePath);
  const now = nowIso();
  const mediaFileId = existing?.id ?? createId();
  const skipProbe =
    existing &&
    basicFileMetadataUnchanged(existing, library, info) &&
    (isRemoteLibrarySource(context.storage.source) ||
      (existingMediaProbeMetadataPresent(existing) && existing.video_frame_rate !== null));
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
    updated_at: now,
  };

  if (existing) {
    const fileUnchanged =
      basicFileMetadataUnchanged(existing, library, info) &&
      existing.duration_seconds === fileValues.duration_seconds &&
      existing.video_codec === fileValues.video_codec &&
      existing.audio_codec === fileValues.audio_codec &&
      existing.container === fileValues.container &&
      existing.video_frame_rate === fileValues.video_frame_rate &&
      existing.audio_channels === fileValues.audio_channels &&
      existing.audio_sample_rate === fileValues.audio_sample_rate &&
      existing.audio_language === fileValues.audio_language &&
      existing.audio_bit_rate === fileValues.audio_bit_rate;

    if (fileUnchanged && existing.existing_provider) {
      await syncSidecarSubtitleTracks(existing.media_item_id, mediaFileId, filePath, now, context);
      return "unchanged" as const;
    }

    const mediaItemId = existing.existing_show_manual_match
      ? existing.media_item_id
      : await findOrCreateEpisodeItem(
          filePath,
          context.storage.root ?? library.path,
          context.tvSeasonMetadataCache,
          context,
          existing.existing_provider ? existing.media_item_id : undefined,
          onMetadataError,
          tvSeasonMetadataMatcher,
        );
    const values = {
      ...fileValues,
      media_item_id: mediaItemId,
    };

    if (fileUnchanged && existing.media_item_id === mediaItemId) {
      await syncSidecarSubtitleTracks(mediaItemId, mediaFileId, filePath, now, context);
      return "unchanged" as const;
    }

    await db.updateTable("media_file").set(values).where("id", "=", existing.id).execute();
    if (probed.probe) await replaceMediaStreamInfo(existing.id, probed.probe, now);
    context.existingFilesByPath.set(filePath, {
      ...existing,
      ...values,
      existing_provider: existing.existing_provider,
      existing_manual_match: existing.existing_manual_match,
      existing_show_manual_match: existing.existing_show_manual_match,
    });
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
    tvSeasonMetadataMatcher,
  );
  const values = {
    ...fileValues,
    media_item_id: mediaItemId,
  };

  await db
    .insertInto("media_file")
    .values({ id: mediaFileId, ...values, created_at: now })
    .execute();
  if (probed.probe) await replaceMediaStreamInfo(mediaFileId, probed.probe, now);
  context.existingFilesByPath.set(filePath, {
    id: mediaFileId,
    ...values,
    existing_provider: null,
    existing_manual_match: null,
    existing_show_manual_match: null,
  });
  await syncSidecarSubtitleTracks(mediaItemId, mediaFileId, filePath, now, context);
  return "added" as const;
}
