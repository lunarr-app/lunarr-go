import { getDb } from "../db";
import { resolveShare, type ResolvedMediaShare } from "./resolve";

export async function assertShareAllowsPlayableItem(share: ResolvedMediaShare, mediaItemId: string) {
  const db = await getDb();
  const item = await db
    .selectFrom("media_item")
    .select(["id", "kind", "parent_id"])
    .where("id", "=", mediaItemId)
    .executeTakeFirst();
  if (!item) {
    throw new Error("Playable item not found.");
  }

  if (share.kind === "movie") {
    if (item.kind !== "movie" || item.id !== share.media_item_id) {
      throw new Error("This share does not include the requested movie.");
    }
    return;
  }

  if (item.kind !== "episode") {
    throw new Error("This share only allows episode playback.");
  }

  const season = await db
    .selectFrom("media_item")
    .select(["id", "parent_id"])
    .where("id", "=", item.parent_id ?? "")
    .where("kind", "=", "season")
    .executeTakeFirst();
  if (!season || season.parent_id !== share.media_item_id) {
    throw new Error("This share does not include the requested episode.");
  }

  if (share.seasonIds !== null && !share.seasonIds.includes(season.id)) {
    throw new Error("This share does not include the requested season.");
  }
}

async function authorizedShareForMediaItem(share: ResolvedMediaShare, mediaItemId: string) {
  try {
    await assertShareAllowsPlayableItem(share, mediaItemId);
  } catch {
    return null;
  }
  return { userId: share.created_by_user_id };
}

export async function verifyShareMediaAccess(input: { token: string; mediaFileId: string }) {
  const share = await resolveShare(input.token);
  if (!share) return null;

  const db = await getDb();
  const file = await db
    .selectFrom("media_file")
    .select(["id", "media_item_id"])
    .where("id", "=", input.mediaFileId)
    .executeTakeFirst();
  if (!file) return null;

  return authorizedShareForMediaItem(share, file.media_item_id);
}

export async function verifyShareSubtitleAccess(input: { token: string; subtitleTrackId: string }) {
  const share = await resolveShare(input.token);
  if (!share) return null;

  const db = await getDb();
  const track = await db
    .selectFrom("subtitle_track")
    .select(["id", "media_item_id", "media_file_id"])
    .where("id", "=", input.subtitleTrackId)
    .executeTakeFirst();
  if (!track?.media_file_id) return null;

  return authorizedShareForMediaItem(share, track.media_item_id);
}

export async function verifySharePlaybackSessionAccess(input: { token: string; playbackSessionId: string }) {
  const share = await resolveShare(input.token);
  if (!share) return null;

  const db = await getDb();
  const session = await db
    .selectFrom("playback_session")
    .select(["id", "media_file_id"])
    .where("id", "=", input.playbackSessionId)
    .executeTakeFirst();
  if (!session) return null;

  const file = await db
    .selectFrom("media_file")
    .select(["id", "media_item_id"])
    .where("id", "=", session.media_file_id)
    .executeTakeFirst();
  if (!file) return null;

  return authorizedShareForMediaItem(share, file.media_item_id);
}
