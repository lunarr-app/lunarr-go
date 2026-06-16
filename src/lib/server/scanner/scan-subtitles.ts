import path from "node:path";
import { getDb } from "../db";
import { createId } from "../id";
import { isSidecarSubtitlePath } from "./media-files";
import { readCachedDirectoryEntries } from "./scan-context";
import type { ScanContext } from "./scan-types";

function sidecarSubtitleMatch(videoPath: string, subtitlePath: string) {
  const video = path.parse(videoPath);
  const subtitle = path.parse(subtitlePath);
  if (!isSidecarSubtitlePath(subtitlePath)) return false;
  if (path.dirname(subtitlePath) !== path.dirname(videoPath)) return false;
  return (
    subtitle.name === video.name ||
    subtitle.name.startsWith(`${video.name}.`) ||
    subtitle.name.startsWith(`${video.name}-`) ||
    subtitle.name.startsWith(`${video.name}_`)
  );
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
    isDefault: suffix.length === 0 || index === 0,
  };
}

async function findSidecarSubtitleFiles(videoPath: string, context: ScanContext) {
  const directory = path.dirname(videoPath);
  const result = await readCachedDirectoryEntries(directory, context);
  if (!result.ok) return null;
  return result.paths
    .filter((subtitlePath) => sidecarSubtitleMatch(videoPath, subtitlePath))
    .sort((left, right) => left.localeCompare(right));
}

export async function syncSidecarSubtitleTracks(
  mediaItemId: string,
  mediaFileId: string,
  filePath: string,
  now: string,
  context: ScanContext,
) {
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
      updated_at: now,
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
