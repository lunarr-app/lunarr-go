import { Readable } from "node:stream";
import { getDb } from "../db";
import { createLibraryStorage } from "../storage";
import { inlineContentDisposition } from "./stream";
import { sql } from "kysely";

export async function getExternalMovieSubtitleTrack(id: string, userId: string) {
  const db = await getDb();
  return db
    .selectFrom("subtitle_track")
    .innerJoin("media_item", "media_item.id", "subtitle_track.media_item_id")
    .leftJoin("media_file", "media_file.id", "subtitle_track.media_file_id")
    .leftJoin("library", "library.id", "media_file.library_id")
    .select([
      "subtitle_track.path",
      "subtitle_track.mime_type",
      "subtitle_track.label",
      "library.source",
      "library.config_json"
    ])
    .where("subtitle_track.id", "=", id)
    .where("subtitle_track.source_kind", "=", "external")
    .where("media_item.kind", "in", ["movie", "episode"])
    .where(sql<boolean>`(
      exists (
        select 1 from user
        where user.id = ${userId}
          and user.role = 'admin'
      )
      or library.access_mode = 'all'
      or exists (
        select 1 from library_user
        where library_user.library_id = media_file.library_id
          and library_user.user_id = ${userId}
      )
    )`)
    .executeTakeFirst();
}

export async function externalMovieSubtitleResponse(id: string, userId: string, includeBody = true) {
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
    "content-disposition": inlineContentDisposition(track.label)
  };

  if (!includeBody) {
    await storage.close();
    return new Response(null, { headers });
  }

  let stream: Readable;
  try {
    stream = await storage.createReadStream(track.path);
  } catch (error) {
    await storage.close();
    throw error;
  }
  return new Response(Readable.toWeb(stream) as unknown as BodyInit, {
    headers
  });
}
