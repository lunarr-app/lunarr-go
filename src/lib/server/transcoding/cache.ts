import { createHash } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { sql } from "kysely";
import { getDb } from "../db";
import { currentDatabasePaths } from "../db";
import { getSetting, setSetting } from "../settings";
import { nowIso } from "../time";
import type { TranscodeMode } from "../db/schema/streaming";
import type { TranscodePolicy } from "./policy";
import type { HlsSegmentFormat } from "./hls";
import { ENCODE_AHEAD_SEGMENT_COUNT } from "./hls";
import { onEncodeCacheIdle } from "./encode-coordinator";

const PLAYBACK_CACHE_ROOT_NAME = "playback-cache";
const PLAYBACK_CACHE_TTL_MS_KEY = "playback_cache_ttl_ms";
const ENCODE_AHEAD_SEGMENT_COUNT_KEY = "encode_ahead_segment_count";
const DEFAULT_PLAYBACK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function playbackCacheRoot() {
  return path.join(currentDatabasePaths().dataDir, PLAYBACK_CACHE_ROOT_NAME);
}

export function playbackCacheArtifactDirectory(cacheId: string) {
  return path.join(playbackCacheRoot(), cacheId);
}

export function computePlaybackPolicyHash(input: {
  policy: TranscodePolicy;
  segmentFormat: HlsSegmentFormat;
  audioStreamIndex: number | null;
}) {
  return createHash("sha256")
    .update(
      [
        input.policy.transcodingEnabled,
        input.policy.hardwareAcceleration,
        input.policy.hardwareAccelerationRequired,
        input.policy.transcodeQualityPreset,
        input.policy.transcodeQuality.softwareCrf,
        input.policy.transcodeQuality.hardwareBitrate,
        input.policy.transcodeQuality.maxHeight ?? "",
        input.segmentFormat,
        input.audioStreamIndex ?? "",
      ].join("\0"),
    )
    .digest("hex");
}

export function computePlaybackCacheId(input: {
  mediaFileId: string;
  fileSizeBytes: number;
  fileMtimeMs: number;
  mode: TranscodeMode;
  policyHash: string;
}) {
  return createHash("sha256")
    .update([input.mediaFileId, input.fileSizeBytes, input.fileMtimeMs, input.mode, input.policyHash].join("\0"))
    .digest("hex");
}

export async function getEncodeAheadSegmentCount() {
  const raw = await getSetting(ENCODE_AHEAD_SEGMENT_COUNT_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ENCODE_AHEAD_SEGMENT_COUNT;
}

export async function setEncodeAheadSegmentCount(value: number) {
  await setSetting(ENCODE_AHEAD_SEGMENT_COUNT_KEY, String(Math.max(1, Math.floor(value))));
}

export async function getPlaybackCacheTtlMs() {
  const raw = await getSetting(PLAYBACK_CACHE_TTL_MS_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PLAYBACK_CACHE_TTL_MS;
}

export async function setPlaybackCacheTtlMs(value: number) {
  await setSetting(PLAYBACK_CACHE_TTL_MS_KEY, String(Math.max(60_000, Math.floor(value))));
}

async function directorySizeBytes(directory: string): Promise<number> {
  let details;
  try {
    details = await stat(directory);
  } catch {
    return 0;
  }
  if (!details.isDirectory()) return details.size;

  let total = 0;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await directorySizeBytes(entryPath);
    } else if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}

async function removePlaybackCacheEntry(cacheId: string) {
  const db = await getDb();
  const row = await db
    .selectFrom("playback_hls_cache")
    .select(["artifact_dir"])
    .where("id", "=", cacheId)
    .executeTakeFirst();
  if (!row) return;
  await db.deleteFrom("playback_hls_cache").where("id", "=", cacheId).execute();
  await rm(row.artifact_dir, { recursive: true, force: true }).catch(() => undefined);
}

export async function acquirePlaybackCache(input: {
  sessionId: string;
  mediaFileId: string;
  fileSizeBytes: number;
  fileMtimeMs: number;
  mode: TranscodeMode;
  policy: TranscodePolicy;
  segmentFormat: HlsSegmentFormat;
  audioStreamIndex: number | null;
}) {
  const policyHash = computePlaybackPolicyHash({
    policy: input.policy,
    segmentFormat: input.segmentFormat,
    audioStreamIndex: input.audioStreamIndex,
  });
  const cacheId = computePlaybackCacheId({
    mediaFileId: input.mediaFileId,
    fileSizeBytes: input.fileSizeBytes,
    fileMtimeMs: input.fileMtimeMs,
    mode: input.mode,
    policyHash,
  });
  const artifactDir = playbackCacheArtifactDirectory(cacheId);
  const db = await getDb();
  const now = nowIso();

  await db.transaction().execute(async (tx) => {
    const existing = await tx.selectFrom("playback_hls_cache").selectAll().where("id", "=", cacheId).executeTakeFirst();

    if (
      existing &&
      existing.ref_count === 0 &&
      (existing.file_size_bytes !== input.fileSizeBytes || existing.file_mtime_ms !== input.fileMtimeMs)
    ) {
      await tx.deleteFrom("playback_hls_cache").where("id", "=", cacheId).execute();
      await rm(artifactDir, { recursive: true, force: true }).catch(() => undefined);
    }

    const current = await tx.selectFrom("playback_hls_cache").selectAll().where("id", "=", cacheId).executeTakeFirst();

    if (!current) {
      await mkdir(artifactDir, { recursive: true });
      await tx
        .insertInto("playback_hls_cache")
        .values({
          id: cacheId,
          media_file_id: input.mediaFileId,
          mode: input.mode,
          policy_hash: policyHash,
          file_size_bytes: input.fileSizeBytes,
          file_mtime_ms: input.fileMtimeMs,
          artifact_dir: artifactDir,
          furthest_segment_index: null,
          bytes: 0,
          ref_count: 1,
          last_access_at: now,
          created_at: now,
          updated_at: now,
        })
        .execute();
    } else {
      await tx
        .updateTable("playback_hls_cache")
        .set({
          ref_count: current.ref_count + 1,
          last_access_at: now,
          updated_at: now,
        })
        .where("id", "=", cacheId)
        .execute();
    }

    await tx
      .updateTable("playback_session")
      .set({ cache_id: cacheId, updated_at: now })
      .where("id", "=", input.sessionId)
      .execute();
  });

  return { cacheId, encodeArtifactDirectory: artifactDir };
}

export async function switchPlaybackCacheForSession(input: {
  sessionId: string;
  mediaFileId: string;
  fileSizeBytes: number;
  fileMtimeMs: number;
  mode: TranscodeMode;
  policy: TranscodePolicy;
  segmentFormat: HlsSegmentFormat;
  audioStreamIndex: number | null;
}) {
  await releasePlaybackCacheForSession(input.sessionId);
  return acquirePlaybackCache(input);
}

export async function releasePlaybackCacheForSession(sessionId: string) {
  const db = await getDb();
  const session = await db
    .selectFrom("playback_session")
    .select(["cache_id"])
    .where("id", "=", sessionId)
    .executeTakeFirst();
  if (!session?.cache_id) return;

  const cacheId = session.cache_id;
  const now = nowIso();
  const cleared = await db
    .updateTable("playback_session")
    .set({ cache_id: null, updated_at: now })
    .where("id", "=", sessionId)
    .where("cache_id", "=", cacheId)
    .executeTakeFirst();
  if (Number(cleared.numUpdatedRows ?? 0) === 0) return;

  await db
    .updateTable("playback_hls_cache")
    .set({
      ref_count: sql<number>`MAX(0, ref_count - 1)`,
      last_access_at: now,
      updated_at: now,
    })
    .where("id", "=", cacheId)
    .execute();

  const cache = await db
    .selectFrom("playback_hls_cache")
    .select(["ref_count"])
    .where("id", "=", cacheId)
    .executeTakeFirst();
  if ((cache?.ref_count ?? 0) === 0) {
    onEncodeCacheIdle(cacheId);
  }
}

export async function touchPlaybackCacheForSession(sessionId: string) {
  const db = await getDb();
  const session = await db
    .selectFrom("playback_session")
    .select(["cache_id"])
    .where("id", "=", sessionId)
    .executeTakeFirst();
  if (!session?.cache_id) return;

  const now = nowIso();
  await db
    .updateTable("playback_hls_cache")
    .set({ last_access_at: now, updated_at: now })
    .where("id", "=", session.cache_id)
    .execute();
}

export async function getPlaybackCacheBindingForSession(sessionId: string) {
  const db = await getDb();
  const row = await db
    .selectFrom("playback_session")
    .leftJoin("playback_hls_cache", "playback_hls_cache.id", "playback_session.cache_id")
    .select(["playback_session.cache_id as cacheId", "playback_hls_cache.artifact_dir as artifactDir"])
    .where("playback_session.id", "=", sessionId)
    .executeTakeFirst();
  return {
    cacheId: row?.cacheId ?? null,
    encodeArtifactDirectory: row?.artifactDir ?? null,
  };
}

export async function updatePlaybackCacheStats(cacheId: string, furthestSegmentIndex: number) {
  const db = await getDb();
  const artifactDir = playbackCacheArtifactDirectory(cacheId);
  const bytes = await directorySizeBytes(artifactDir);
  const now = nowIso();
  await db
    .updateTable("playback_hls_cache")
    .set({
      furthest_segment_index: furthestSegmentIndex,
      bytes,
      last_access_at: now,
      updated_at: now,
    })
    .where("id", "=", cacheId)
    .execute();
}

export async function isPlaybackCacheEntryStale(cacheId: string) {
  const db = await getDb();
  const row = await db
    .selectFrom("playback_hls_cache")
    .innerJoin("media_file", "media_file.id", "playback_hls_cache.media_file_id")
    .select([
      "playback_hls_cache.file_size_bytes as fileSizeBytes",
      "playback_hls_cache.file_mtime_ms as fileMtimeMs",
      "media_file.size_bytes as currentSizeBytes",
      "media_file.mtime_ms as currentMtimeMs",
    ])
    .where("playback_hls_cache.id", "=", cacheId)
    .executeTakeFirst();
  if (!row) return true;
  return row.fileSizeBytes !== row.currentSizeBytes || row.fileMtimeMs !== row.currentMtimeMs;
}

export type PlaybackCacheCleanupResult = {
  removed: number;
};

export async function invalidateStalePlaybackCacheEntries(): Promise<PlaybackCacheCleanupResult> {
  const db = await getDb();
  let removed = 0;
  const rows = await db
    .selectFrom("playback_hls_cache")
    .innerJoin("media_file", "media_file.id", "playback_hls_cache.media_file_id")
    .select([
      "playback_hls_cache.id as id",
      "playback_hls_cache.ref_count as refCount",
      "playback_hls_cache.file_size_bytes as fileSizeBytes",
      "playback_hls_cache.file_mtime_ms as fileMtimeMs",
      "media_file.size_bytes as currentSizeBytes",
      "media_file.mtime_ms as currentMtimeMs",
    ])
    .execute();

  for (const row of rows) {
    if (row.refCount > 0) continue;
    if (row.fileSizeBytes !== row.currentSizeBytes || row.fileMtimeMs !== row.currentMtimeMs) {
      await removePlaybackCacheEntry(row.id);
      removed += 1;
    }
  }

  return { removed };
}

export async function sumPlaybackCacheBytes() {
  const db = await getDb();
  const rows = await db.selectFrom("playback_hls_cache").select(["bytes"]).execute();
  return rows.reduce((sum, row) => sum + row.bytes, 0);
}

export async function cleanupPlaybackHlsCache(
  maxBytes: number,
  maxIdleMs: number,
  options?: { forceIdle?: boolean },
): Promise<PlaybackCacheCleanupResult> {
  const db = await getDb();
  const idleCutoff = new Date(Date.now() - Math.max(0, maxIdleMs)).toISOString();
  let removed = 0;

  const invalidated = await invalidateStalePlaybackCacheEntries();
  removed += invalidated.removed;

  if (options?.forceIdle) {
    const idle = await db.selectFrom("playback_hls_cache").selectAll().where("ref_count", "=", 0).execute();
    for (const entry of idle) {
      await removePlaybackCacheEntry(entry.id);
      removed += 1;
    }
    return { removed };
  }

  const stale = await db
    .selectFrom("playback_hls_cache")
    .selectAll()
    .where("ref_count", "=", 0)
    .where("last_access_at", "<", idleCutoff)
    .execute();
  for (const entry of stale) {
    await removePlaybackCacheEntry(entry.id);
    removed += 1;
  }

  const remaining = await db.selectFrom("playback_hls_cache").selectAll().orderBy("last_access_at", "asc").execute();
  let totalBytes = remaining.reduce((sum, entry) => sum + entry.bytes, 0);
  const byteLimit = Math.max(0, maxBytes);

  for (const entry of remaining) {
    if (totalBytes <= byteLimit) break;
    if (entry.ref_count > 0) continue;
    await removePlaybackCacheEntry(entry.id);
    totalBytes -= entry.bytes;
    removed += 1;
  }

  return { removed };
}

export async function getPlaybackCacheStatus() {
  const db = await getDb();
  const rows = await db.selectFrom("playback_hls_cache").select(["bytes", "ref_count"]).execute();
  return {
    entries: rows.length,
    bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    activeRefs: rows.reduce((sum, row) => sum + row.ref_count, 0),
    idleEntries: rows.filter((row) => row.ref_count === 0).length,
  };
}
