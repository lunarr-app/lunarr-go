import type { AdminShareRecord, PublicShareRecord, SharePageData } from "$lib/shares/types";
import { SHARE_LIST_RECENTLY_EXPIRED_MS, SHARE_PAGE_SIZE, type ShareListStatus } from "$lib/shares/constants";
import { catalogPageInfo, catalogPageSize } from "../media/catalog";
import { randomBytes } from "node:crypto";
import { getDb } from "../db";
import { getMovieDetail } from "../media/movies";
import { getShowDetail } from "../media/shows";
import { nowIso } from "../time";
import type { CreateShareInput } from "./input";
import {
  isShareActive,
  mapShareRow,
  resolveShare,
  serializeSeasonIds,
  type MediaShareRow,
  type ResolvedMediaShare,
} from "./resolve";

function publicShareRecord(share: ResolvedMediaShare): PublicShareRecord {
  return {
    id: share.id,
    token: share.token,
    kind: share.kind,
    mediaItemId: share.media_item_id,
    seasonIds: share.seasonIds,
    expiresAt: share.expires_at,
    revokedAt: share.revoked_at,
    createdAt: share.created_at,
    active: isShareActive(share),
    sharePath: `/share/${share.token}`,
  };
}

function adminShareRecord(input: {
  share: ResolvedMediaShare;
  title: string;
  createdByName: string;
  createdByEmail: string;
}): AdminShareRecord {
  const record = publicShareRecord(input.share);
  return {
    ...record,
    title: input.title,
    contentHref: record.kind === "movie" ? `/movies/${record.mediaItemId}` : `/shows/${record.mediaItemId}`,
    createdByName: input.createdByName,
    createdByEmail: input.createdByEmail,
  };
}

function normalizeShareListStatus(value: string | null | undefined): ShareListStatus {
  if (value === "active" || value === "expired" || value === "revoked") return value;
  return "all";
}

function shareListBaseQuery(db: Awaited<ReturnType<typeof getDb>>) {
  return db
    .selectFrom("media_share")
    .innerJoin("media_item", "media_item.id", "media_share.media_item_id")
    .innerJoin("user", "user.id", "media_share.created_by_user_id");
}

function applyShareListStatusFilter<Q extends { where: Function }>(query: Q, status: ShareListStatus, now: string): Q {
  if (status === "active") {
    return query.where("media_share.revoked_at", "is", null).where("media_share.expires_at", ">", now) as Q;
  }
  if (status === "expired") {
    return query.where("media_share.revoked_at", "is", null).where("media_share.expires_at", "<=", now) as Q;
  }
  if (status === "revoked") {
    return query.where("media_share.revoked_at", "is not", null) as Q;
  }
  return query;
}

const adminShareSelect = [
  "media_share.id",
  "media_share.token",
  "media_share.created_by_user_id",
  "media_share.kind",
  "media_share.media_item_id",
  "media_share.season_ids",
  "media_share.expires_at",
  "media_share.revoked_at",
  "media_share.created_at",
  "media_item.title as media_title",
  "user.name as creator_name",
  "user.email as creator_email",
] as const;

function createShareToken() {
  return randomBytes(32).toString("base64url");
}

async function validateShareTarget(input: CreateShareInput, userId: string) {
  if (input.kind === "movie") {
    const detail = await getMovieDetail(input.mediaItemId, userId);
    if (!detail) {
      throw new Error("Movie not found or not playable.");
    }
    return;
  }

  const detail = await getShowDetail(input.mediaItemId, userId);
  if (!detail) {
    throw new Error("Show not found or not playable.");
  }

  if (input.seasonIds) {
    const allowedSeasonIds = new Set(detail.seasons.map((season) => season.id));
    for (const seasonId of input.seasonIds) {
      if (!allowedSeasonIds.has(seasonId)) {
        throw new Error("One or more selected seasons are not part of this show.");
      }
    }
    const hasPlayableEpisode = detail.seasons.some(
      (season) =>
        input.seasonIds!.includes(season.id) &&
        season.episodes.some((episode) => episode.fileCount > 0 && episode.fileId),
    );
    if (!hasPlayableEpisode) {
      throw new Error("Selected seasons do not contain any playable episodes.");
    }
    return;
  }

  const hasPlayableEpisode = detail.seasons.some((season) =>
    season.episodes.some((episode) => episode.fileCount > 0 && episode.fileId),
  );
  if (!hasPlayableEpisode) {
    throw new Error("This show does not contain any playable episodes.");
  }
}

export async function createShare(input: CreateShareInput & { userId: string }) {
  await validateShareTarget(input, input.userId);
  const db = await getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  const token = createShareToken();

  await db
    .insertInto("media_share")
    .values({
      id,
      token,
      created_by_user_id: input.userId,
      kind: input.kind,
      media_item_id: input.mediaItemId,
      season_ids: serializeSeasonIds(input.seasonIds) as string | null,
      expires_at: input.expiresAt,
      revoked_at: null,
      created_at: now,
    })
    .execute();

  const share = await db.selectFrom("media_share").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
  return publicShareRecord(mapShareRow(share as MediaShareRow));
}

export async function revokeShare(input: { shareId: string }) {
  const db = await getDb();
  const existing = await db.selectFrom("media_share").selectAll().where("id", "=", input.shareId).executeTakeFirst();
  if (!existing) {
    throw new Error("Share not found.");
  }
  if (existing.revoked_at) {
    return publicShareRecord(mapShareRow(existing as MediaShareRow));
  }

  const revokedAt = nowIso();
  await db.updateTable("media_share").set({ revoked_at: revokedAt }).where("id", "=", input.shareId).execute();
  return publicShareRecord(
    mapShareRow({
      ...(existing as MediaShareRow),
      revoked_at: revokedAt,
    }),
  );
}

export async function listSharesForMedia(mediaItemId: string) {
  const db = await getDb();
  const cutoff = new Date(Date.now() - SHARE_LIST_RECENTLY_EXPIRED_MS).toISOString();
  const rows = await db
    .selectFrom("media_share")
    .selectAll()
    .where("media_item_id", "=", mediaItemId)
    .where((eb) =>
      eb.or([
        eb("revoked_at", "is", null).and("expires_at", ">", nowIso()),
        eb("expires_at", ">=", cutoff),
        eb("revoked_at", "is not", null),
      ]),
    )
    .orderBy("created_at", "desc")
    .execute();

  return rows.map((row) => publicShareRecord(mapShareRow(row as MediaShareRow)));
}

export async function listAllShares(): Promise<AdminShareRecord[]> {
  const { shares } = await listAdminSharesPage({ page: 1, pageSize: 10_000, status: "all" });
  return shares;
}

export async function shareListCounts() {
  const db = await getDb();
  const now = nowIso();
  const countFor = async (status: ShareListStatus) => {
    const row = await applyShareListStatusFilter(
      db.selectFrom("media_share").select((eb) => eb.fn.countAll<number>().as("total")),
      status,
      now,
    ).executeTakeFirst();
    return Number(row?.total ?? 0);
  };

  const [all, active, expired, revoked] = await Promise.all([
    countFor("all"),
    countFor("active"),
    countFor("expired"),
    countFor("revoked"),
  ]);

  return { all, active, expired, revoked };
}

export async function listAdminSharesPage(options: {
  page?: number;
  pageSize?: number;
  status?: ShareListStatus | string | null;
}) {
  const db = await getDb();
  const now = nowIso();
  const status = normalizeShareListStatus(options.status);
  const pageSize = catalogPageSize(options.pageSize ?? SHARE_PAGE_SIZE);

  const totalRow = await applyShareListStatusFilter(
    db.selectFrom("media_share").select((eb) => eb.fn.countAll<number>().as("total")),
    status,
    now,
  ).executeTakeFirst();
  const page = catalogPageInfo(options.page ?? 1, pageSize, Number(totalRow?.total ?? 0));
  const offset = (page.page - 1) * page.pageSize;

  const rows = await applyShareListStatusFilter(shareListBaseQuery(db).select(adminShareSelect), status, now)
    .orderBy("media_share.created_at", "desc")
    .offset(offset)
    .limit(page.pageSize)
    .execute();

  const shares = rows.map((row) =>
    adminShareRecord({
      share: mapShareRow(row as MediaShareRow),
      title: row.media_title,
      createdByName: row.creator_name,
      createdByEmail: row.creator_email,
    }),
  );

  return { shares, page, status };
}

export async function cleanupExpiredShares(options: { retentionMs?: number; now?: number } = {}) {
  const retentionMs = options.retentionMs ?? SHARE_LIST_RECENTLY_EXPIRED_MS;
  const cutoff = new Date((options.now ?? Date.now()) - retentionMs).toISOString();
  const db = await getDb();
  const result = await db.deleteFrom("media_share").where("expires_at", "<", cutoff).executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}

export async function getSharePageData(token: string): Promise<SharePageData | null> {
  const share = await resolveShare(token);
  if (!share) return null;

  const userId = share.created_by_user_id;

  if (share.kind === "movie") {
    const detail = await getMovieDetail(share.media_item_id, userId);
    if (!detail) return null;

    return {
      kind: "movie",
      token: share.token,
      expiresAt: share.expires_at,
      title: detail.movie.title,
      overview: detail.movie.overview,
      posterUrl: detail.posterUrl,
      backdropUrl: detail.backdropUrl,
      runtimeSeconds: detail.movie.runtime_seconds,
      releaseDate: detail.movie.release_date,
      movieId: detail.movie.id,
      fileId: detail.files[0]?.id ?? null,
    };
  }

  const detail = await getShowDetail(share.media_item_id, userId);
  if (!detail) return null;

  const allowedSeasonIds = share.seasonIds ? new Set(share.seasonIds) : null;
  const seasons = detail.seasons
    .filter((season) => !allowedSeasonIds || allowedSeasonIds.has(season.id))
    .map((season) => ({
      id: season.id,
      title: season.title,
      seasonNumber: season.seasonNumber,
      posterUrl: season.posterUrl,
      episodes: season.episodes
        .filter((episode) => episode.fileCount > 0 && episode.fileId)
        .map((episode) => ({
          id: episode.id,
          title: episode.title,
          overview: episode.overview,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          runtimeSeconds: episode.runtimeSeconds,
          stillUrl: episode.stillUrl,
          fileId: episode.fileId,
        })),
    }))
    .filter((season) => season.episodes.length > 0);

  if (seasons.length === 0) return null;

  return {
    kind: "show",
    token: share.token,
    expiresAt: share.expires_at,
    title: detail.show.title,
    overview: detail.show.overview,
    posterUrl: detail.show.posterUrl,
    backdropUrl: detail.show.backdropUrl,
    showId: detail.show.id,
    seasons,
  };
}

export { assertShareAllowsPlayableItem } from "./access";
export { parseCreateShareInput } from "./input";
export { resolveShare } from "./resolve";
