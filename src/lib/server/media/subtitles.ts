import { Readable } from "node:stream";
import { sql } from "kysely";
import { getDb } from "../db";
import { createLibraryStorage } from "../storage";
import { attachStreamAbortCleanup, inlineContentDisposition } from "./stream";
import { accessibleLibrarySql } from "./catalog";

export async function getExternalMovieSubtitleTrack(id: string, userId: string) {
  const db = await getDb();
  return db
    .selectFrom("subtitle_track")
    .innerJoin("media_item", "media_item.id", "subtitle_track.media_item_id")
    .innerJoin("media_file as storage_file", (join) =>
      join.on(
        sql<boolean>`(
          storage_file.id = subtitle_track.media_file_id
          or (
            subtitle_track.media_file_id is null
            and storage_file.media_item_id = subtitle_track.media_item_id
          )
        )`,
      ),
    )
    .innerJoin("library", "library.id", "storage_file.library_id")
    .select([
      "subtitle_track.path",
      "subtitle_track.mime_type",
      "subtitle_track.label",
      "library.source",
      "library.config_json",
    ])
    .where("subtitle_track.id", "=", id)
    .where("subtitle_track.source_kind", "=", "external")
    .where("media_item.kind", "in", ["movie", "episode"])
    .where(accessibleLibrarySql(userId, "storage_file.library_id"))
    .orderBy("storage_file.basename", "asc")
    .executeTakeFirst();
}

export async function externalMovieSubtitleResponse(
  id: string,
  userId: string,
  includeBody = true,
  signal?: AbortSignal | null,
) {
  const track = await getExternalMovieSubtitleTrack(id, userId);
  if (!track?.path || !track.source) return new Response(includeBody ? "Not found" : null, { status: 404 });

  const storage = await createLibraryStorage(track);
  const info = await storage.statFile(track.path);
  if (!info) {
    await storage.close();
    return new Response(includeBody ? "Subtitle file is no longer available" : null, { status: 404 });
  }

  const headers = {
    "content-type": track.mime_type ?? "text/vtt",
    "content-length": String(info.size),
    "content-disposition": inlineContentDisposition(track.label),
  };

  if (!includeBody) {
    await storage.close();
    return new Response(null, { headers });
  }

  if (signal?.aborted) {
    await storage.close();
    return new Response(null, { status: 499 });
  }

  let stream: Readable;
  try {
    stream = await storage.createReadStream(track.path);
  } catch (error) {
    await storage.close();
    throw error;
  }
  attachStreamAbortCleanup(stream, storage, signal);
  if (signal?.aborted) {
    return new Response(null, { status: 499 });
  }
  return new Response(Readable.toWeb(stream) as unknown as BodyInit, {
    headers,
  });
}
