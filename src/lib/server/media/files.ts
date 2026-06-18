import { getDb } from "../db";
import { accessibleLibrarySql } from "./catalog";

export async function getWatchItemDetail(id: string, userId: string) {
  const db = await getDb();
  const item = await db
    .selectFrom("media_item")
    .select(["id", "kind", "title", "parent_id", "season_number", "episode_number"])
    .where("id", "=", id)
    .where("kind", "in", ["movie", "episode"])
    .executeTakeFirst();
  if (!item) return null;

  const files = await db
    .selectFrom("media_file")
    .select("id")
    .where("media_item_id", "=", id)
    .where(accessibleLibrarySql(userId))
    .execute();
  if (files.length === 0) return null;

  const progress = await db
    .selectFrom("watch_progress")
    .innerJoin("media_file", "media_file.id", "watch_progress.media_file_id")
    .select([
      "watch_progress.media_file_id",
      "watch_progress.position_seconds",
      "watch_progress.duration_seconds",
      "watch_progress.completed",
      "watch_progress.updated_at",
    ])
    .where("watch_progress.media_item_id", "=", id)
    .where("watch_progress.user_id", "=", userId)
    .where(accessibleLibrarySql(userId))
    .execute();

  if (item.kind === "movie") {
    return {
      item: {
        id: item.id,
        kind: item.kind,
        title: item.title,
        backHref: `/movies/${item.id}`,
      },
      progress,
    };
  }

  let title = item.title;
  let backHref = `/episodes/${item.id}`;
  if (item.parent_id) {
    const season = await db
      .selectFrom("media_item")
      .select(["id", "parent_id"])
      .where("id", "=", item.parent_id)
      .where("kind", "=", "season")
      .executeTakeFirst();
    if (season?.parent_id) {
      const show = await db
        .selectFrom("media_item")
        .select(["id", "title"])
        .where("id", "=", season.parent_id)
        .where("kind", "=", "show")
        .executeTakeFirst();
      if (show) {
        const seasonNumber = item.season_number === null ? "?" : String(item.season_number).padStart(2, "0");
        const episodeNumber = item.episode_number === null ? "?" : String(item.episode_number).padStart(2, "0");
        title = `${show.title} - S${seasonNumber}E${episodeNumber} - ${item.title}`;
        backHref = `/shows/${show.id}`;
      }
    }
  }

  return {
    item: {
      id: item.id,
      kind: item.kind,
      title,
      backHref,
    },
    progress,
  };
}

export async function getMediaFile(id: string, userId: string) {
  const db = await getDb();
  return db
    .selectFrom("media_file")
    .innerJoin("media_item", "media_item.id", "media_file.media_item_id")
    .innerJoin("library", "library.id", "media_file.library_id")
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
      "library.source",
      "library.config_json",
      "media_item.title",
    ])
    .where("media_file.id", "=", id)
    .where("media_item.kind", "in", ["movie", "episode"])
    .where(accessibleLibrarySql(userId))
    .executeTakeFirst();
}

export async function getFirstPlayableFile(mediaItemId: string, userId: string) {
  const db = await getDb();
  return db
    .selectFrom("media_file")
    .innerJoin("media_item", "media_item.id", "media_file.media_item_id")
    .innerJoin("library", "library.id", "media_file.library_id")
    .select([
      "media_file.id",
      "media_file.media_item_id",
      "media_file.basename",
      "media_file.extension",
      "media_file.size_bytes",
      "media_file.duration_seconds",
      "media_file.video_codec",
      "media_file.audio_codec",
      "media_file.container",
      "library.source",
    ])
    .where("media_file.media_item_id", "=", mediaItemId)
    .where("media_item.kind", "in", ["movie", "episode"])
    .where(accessibleLibrarySql(userId))
    .orderBy("media_file.basename", "asc")
    .executeTakeFirst();
}

export async function getPlayableFile(mediaItemId: string, mediaFileId: string, userId: string) {
  const db = await getDb();
  return db
    .selectFrom("media_file")
    .innerJoin("media_item", "media_item.id", "media_file.media_item_id")
    .innerJoin("library", "library.id", "media_file.library_id")
    .select([
      "media_file.id",
      "media_file.media_item_id",
      "media_file.basename",
      "media_file.extension",
      "media_file.size_bytes",
      "media_file.duration_seconds",
      "media_file.video_codec",
      "media_file.audio_codec",
      "media_file.container",
      "library.source",
    ])
    .where("media_file.media_item_id", "=", mediaItemId)
    .where("media_file.id", "=", mediaFileId)
    .where("media_item.kind", "in", ["movie", "episode"])
    .where(accessibleLibrarySql(userId))
    .executeTakeFirst();
}
