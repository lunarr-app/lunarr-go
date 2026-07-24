import { sql } from "kysely";
import path from "node:path";
import { getDb } from "../db";
import { isRemoteLibrarySource } from "../libraries/source";
import type { MediaKind } from "../db/schema";
import { type LibraryStorage, type StorageFileInfo, type StorageWalkEntry } from "../storage";
import type { SeekableTranscodeInputSource } from "../transcoding/backend";
import { mediaFileValuesFromProbe } from "../transcoding/probe";
import { createSeekableInputSourceFromStorage } from "../transcoding/seekable-input";
import { isVideoFilePath } from "./media-files";
import type { ExistingMediaFile, ProbedFileMetadata, ScanContext, ScannableLibrary } from "./scan-types";
import { chunkedDelete } from "./chunked-delete";

export async function probeScannedFile(
  mediaFileId: string,
  info: StorageFileInfo,
  context: ScanContext,
): Promise<ProbedFileMetadata> {
  const fallbackValues = mediaFileValuesFromProbe({ extension: info.extension }, null);
  if (!context.probeBackend) {
    return {
      probe: null,
      values: fallbackValues,
    };
  }

  let inputSource: SeekableTranscodeInputSource | undefined;
  try {
    inputSource = isRemoteLibrarySource(context.storage.source)
      ? await createSeekableInputSourceFromStorage({
          file: {
            path: info.path,
            extension: info.extension,
            container: fallbackValues.container,
            sizeBytes: info.size,
          },
          storage: context.storage,
          timeoutMs: context.storage.operationTimeoutMs,
        })
      : undefined;
    const probe = await context.probeBackend.probe({
      mediaFileId,
      path: info.path,
      inputSource,
    });
    return {
      probe,
      values: mediaFileValuesFromProbe({ extension: info.extension }, probe),
    };
  } catch {
    return {
      probe: null,
      values: fallbackValues,
    };
  } finally {
    await inputSource?.close().catch(() => undefined);
  }
}

export function fileValuesFromExisting(existing: ExistingMediaFile) {
  return {
    duration_seconds: existing.duration_seconds,
    video_codec: existing.video_codec,
    audio_codec: existing.audio_codec,
    container: existing.container,
    video_frame_rate: existing.video_frame_rate,
    audio_channels: existing.audio_channels,
    audio_sample_rate: existing.audio_sample_rate,
    audio_language: existing.audio_language,
    audio_bit_rate: existing.audio_bit_rate,
  };
}

export function basicFileMetadataUnchanged(
  existing: ExistingMediaFile,
  library: ScannableLibrary,
  info: StorageFileInfo,
) {
  return (
    existing.library_id === library.id &&
    existing.basename === info.basename &&
    existing.extension === info.extension &&
    existing.size_bytes === info.size &&
    existing.mtime_ms === info.mtimeMs
  );
}

export function existingMediaProbeMetadataPresent(existing: ExistingMediaFile) {
  return existing.duration_seconds !== null || existing.video_codec !== null || existing.audio_codec !== null;
}

export async function loadExistingLibraryFiles(libraryId: string) {
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
      "media_file.video_frame_rate",
      "media_file.audio_channels",
      "media_file.audio_sample_rate",
      "media_file.audio_language",
      "media_file.audio_bit_rate",
      "media_item.provider as existing_provider",
    ])
    .where("media_file.library_id", "=", libraryId)
    .execute();
  return new Map(files.map((file) => [file.path, file]));
}

export async function moveMediaFileAssociations(
  fileId: string,
  oldMediaItemId: string,
  newMediaItemId: string,
  now: string,
) {
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
            updated_at: progress.updated_at,
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

export async function readCachedDirectoryEntries(directory: string, context: ScanContext) {
  if (context.directoryEntryCache.has(directory)) {
    return context.directoryEntryCache.get(directory) ?? { ok: false, paths: [] };
  }

  const result = await context.directoryFileReader(directory);
  context.directoryEntryCache.set(directory, result);
  return result;
}

export function defaultDirectoryFileReader(storage: LibraryStorage) {
  return async (directory: string) => {
    const entries = await storage.listFiles(directory);
    return entries ? { ok: true, paths: entries.map((entry) => entry.path) } : { ok: false, paths: [] };
  };
}

export function cacheWalkDirectoryEntry(entry: Extract<StorageWalkEntry, { kind: "directory" }>, context: ScanContext) {
  context.directoryEntryCache.set(entry.path, {
    ok: true,
    paths: entry.files.map((file) => file.path),
  });
  const videoCount = entry.files.filter((file) => isVideoFilePath(file.path)).length;
  if (videoCount > 0) {
    context.directoryVideoCounts.set(entry.path, videoCount);
  } else {
    context.directoryEntryCache.delete(entry.path);
  }
}

export function releaseWalkDirectoryFile(filePath: string, context: ScanContext) {
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

export async function pruneMissingLibraryFiles(
  library: ScannableLibrary,
  seenPaths: Set<string>,
  mediaKind: MediaKind,
) {
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
    await chunkedDelete(missingFileIds, (chunk) => db.deleteFrom("media_file").where("id", "in", chunk).execute());
    await chunkedDelete(affectedMediaItemIds, (chunk) =>
      db
        .deleteFrom("media_item")
        .where("id", "in", chunk)
        .where("kind", "=", mediaKind)
        .$if(mediaKind === "episode", (qb) => qb.where("provider", "is", null))
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("media_file")
                .select("media_file.id")
                .whereRef("media_file.media_item_id", "=", "media_item.id"),
            ),
          ),
        )
        .execute(),
    );

    if (mediaKind === "episode") {
      await deleteOrphanTvContainers();
    }
  }

  return missingFileIds.length;
}

export async function deleteOrphanTvContainers() {
  const db = await getDb();
  await db
    .deleteFrom("media_item")
    .where("kind", "=", "season")
    .where((eb) =>
      eb.not(
        eb.exists(
          eb.selectFrom("media_item as child").select("child.id").whereRef("child.parent_id", "=", "media_item.id"),
        ),
      ),
    )
    .execute();

  await db
    .deleteFrom("media_item")
    .where("kind", "=", "show")
    .where((eb) =>
      eb.not(
        eb.exists(
          eb.selectFrom("media_item as child").select("child.id").whereRef("child.parent_id", "=", "media_item.id"),
        ),
      ),
    )
    .execute();
}
