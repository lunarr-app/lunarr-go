import { getDb } from "../db";
import type { MediaShareKind } from "../db/schema/shares";

export type MediaShareRow = {
  id: string;
  token: string;
  created_by_user_id: string;
  kind: MediaShareKind;
  media_item_id: string;
  season_ids: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type ResolvedMediaShare = MediaShareRow & {
  seasonIds: string[] | null;
};

function parseSeasonIdsJson(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return null;
  }
}

export function mapShareRow(row: MediaShareRow): ResolvedMediaShare {
  return {
    ...row,
    seasonIds: parseSeasonIdsJson(row.season_ids),
  };
}

export function isShareActive(share: Pick<MediaShareRow, "expires_at" | "revoked_at">, now = Date.now()) {
  if (share.revoked_at) return false;
  return Date.parse(share.expires_at) > now;
}

export async function resolveShare(token: string) {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const db = await getDb();
  const row = await db.selectFrom("media_share").selectAll().where("token", "=", trimmed).executeTakeFirst();
  if (!row || !isShareActive(row as MediaShareRow)) return null;
  return mapShareRow(row as MediaShareRow);
}

export function serializeSeasonIds(seasonIds: string[] | null) {
  return seasonIds && seasonIds.length > 0 ? JSON.stringify(seasonIds) : null;
}
