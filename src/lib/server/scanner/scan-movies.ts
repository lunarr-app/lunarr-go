import { getDb } from "../db";
import { createId } from "../id";
import { nowIso } from "../time";
import { isRemoteLibrarySource } from "../libraries/source";
import { emptyMovieMetadataValues, movieMetadataValues, syncMovieMetadataRelations } from "../metadata/store";
import { movieLookupCandidates, type ParsedMovieLookup } from "../metadata/movie-lookup";
import { lookupMovieMetadataFromCandidates, type MovieMetadataMatcher } from "../metadata/matching";
import type { StorageFileInfo } from "../storage";
import { replaceMediaStreamInfo } from "../transcoding/probe";
import {
  basicFileMetadataUnchanged,
  existingMediaProbeMetadataPresent,
  fileValuesFromExisting,
  moveMediaFileAssociations,
  probeScannedFile,
} from "./scan-context";
import { syncSidecarSubtitleTracks } from "./scan-subtitles";
import type { ScanContext, ScannableLibrary } from "./scan-types";

export function sortTitle(title: string) {
  return title.replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

async function findLocalMovieItem(candidate: ParsedMovieLookup, options: { requireUnmatched?: boolean } = {}) {
  const db = await getDb();
  return db
    .selectFrom("media_item")
    .selectAll()
    .where("kind", "=", "movie")
    .where("title", "=", candidate.title)
    .where((eb) => (candidate.year === null ? eb("year", "is", null) : eb("year", "=", candidate.year)))
    .$if(Boolean(options.requireUnmatched), (qb) => qb.where("provider", "is", null))
    .executeTakeFirst();
}

async function findLocalMovieItemForCandidates(
  candidates: ParsedMovieLookup[],
  options: { requireUnmatched?: boolean } = {},
) {
  for (const candidate of candidates) {
    const existing = await findLocalMovieItem(candidate, options);
    if (existing) return existing;
  }
  return null;
}

async function findOrCreateMovieItem(
  libraryRoot: string,
  filePath: string,
  onMetadataError?: (error: unknown) => Promise<void>,
  metadataMatcher?: MovieMetadataMatcher,
) {
  const db = await getDb();
  const candidates = movieLookupCandidates(filePath, undefined, { libraryRoot });
  const parsed = candidates[0] ?? { title: "", year: null };
  const lookup = await lookupMovieMetadataFromCandidates(candidates, {
    onError: onMetadataError,
    matcher: metadataMatcher,
  });
  const metadata = lookup?.metadata ?? null;
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

    const localExisting = await findLocalMovieItemForCandidates(candidates, { requireUnmatched: true });

    if (localExisting) {
      await db.updateTable("media_item").set(values).where("id", "=", localExisting.id).execute();
      await syncMovieMetadataRelations(db, localExisting.id, metadata);
      return localExisting.id;
    }

    const id = createId();
    await db
      .insertInto("media_item")
      .values({ id, ...values, created_at: now })
      .execute();
    await syncMovieMetadataRelations(db, id, metadata);
    return id;
  }

  const existing = await findLocalMovieItemForCandidates(candidates);
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
      updated_at: now,
    })
    .execute();
  return id;
}

export async function scanMovieFile(
  library: ScannableLibrary,
  filePath: string,
  fileInfo: StorageFileInfo | undefined,
  context: ScanContext,
  onMetadataError?: (error: unknown) => Promise<void>,
  metadataMatcher?: MovieMetadataMatcher,
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
    (isRemoteLibrarySource(context.storage.source) || existingMediaProbeMetadataPresent(existing));
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
      existing.container === fileValues.container;

    if (fileUnchanged && existing.existing_provider) {
      await syncSidecarSubtitleTracks(existing.media_item_id, mediaFileId, filePath, now, context);
      return "unchanged" as const;
    }

    const mediaItemId = await findOrCreateMovieItem(library.path, filePath, onMetadataError, metadataMatcher);
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
    });
    await moveMediaFileAssociations(existing.id, existing.media_item_id, mediaItemId, now);
    await syncSidecarSubtitleTracks(mediaItemId, mediaFileId, filePath, now, context);
    return "updated" as const;
  }

  const mediaItemId = await findOrCreateMovieItem(library.path, filePath, onMetadataError, metadataMatcher);
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
  });
  await syncSidecarSubtitleTracks(mediaItemId, mediaFileId, filePath, now, context);
  return "added" as const;
}
