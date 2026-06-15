import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { transcodeQualityTarget, type TranscodePolicy } from "./policy";
import { createTranscodeSession } from "./sessions";
import {
  acquirePlaybackCache,
  cleanupPlaybackHlsCache,
  computePlaybackCacheId,
  computePlaybackPolicyHash,
  getEncodeAheadSegmentCount,
  getPlaybackCacheBindingForSession,
  getPlaybackCacheStatus,
  invalidateStalePlaybackCacheEntries,
  isPlaybackCacheEntryStale,
  playbackCacheArtifactDirectory,
  releasePlaybackCacheForSession,
  setEncodeAheadSegmentCount,
  switchPlaybackCacheForSession,
  updatePlaybackCacheStats,
} from "./cache";

function samplePolicy(overrides: Partial<TranscodePolicy> = {}): TranscodePolicy {
  return {
    transcodingEnabled: true,
    playbackPreference: "auto",
    preferredAudioLanguage: null,
    preferredSubtitleLanguage: null,
    hardwareAcceleration: "off",
    hardwareAccelerationRequired: false,
    transcodeQualityPreset: "auto",
    transcodeQuality: transcodeQualityTarget("auto"),
    ...overrides,
  };
}

describe("playback HLS cache", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  let nowMs: number;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-playback-cache-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();
    nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Playback User",
        email: "playback@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: nowMs,
        updated_at: nowMs,
      })
      .execute();
    await db
      .insertInto("library")
      .values({
        id: "library-1",
        name: "Movies",
        kind: "movie",
        source: "local",
        path: tempDir,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_item")
      .values({
        id: "movie-1",
        kind: "movie",
        title: "Movie",
        sort_title: "movie",
        year: 2026,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2026-01-01",
        provider: null,
        provider_id: null,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "file-1",
        library_id: "library-1",
        media_item_id: "movie-1",
        path: path.join(tempDir, "Movie.2026.mkv"),
        basename: "Movie.2026.mkv",
        extension: ".mkv",
        size_bytes: 100,
        mtime_ms: nowMs,
        duration_seconds: 120,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "mkv",
        created_at: now,
        updated_at: now,
      })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  async function exists(filePath: string) {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async function acquireForSession(
    sessionId: string,
    overrides: { fileSizeBytes?: number; fileMtimeMs?: number } = {},
  ) {
    return acquirePlaybackCache({
      sessionId,
      mediaFileId: "file-1",
      fileSizeBytes: overrides.fileSizeBytes ?? 100,
      fileMtimeMs: overrides.fileMtimeMs ?? nowMs,
      mode: "transcode",
      policy: samplePolicy(),
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });
  }

  test("computePlaybackCacheId changes when source metadata changes", () => {
    const policyHash = "policy-hash";
    const base = {
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode" as const,
      policyHash,
    };
    const first = computePlaybackCacheId(base);
    const second = computePlaybackCacheId({ ...base, fileMtimeMs: nowMs + 1 });
    expect(second).not.toBe(first);
  });

  test("computePlaybackPolicyHash changes when transcoding policy changes", () => {
    const base = {
      policy: samplePolicy(),
      segmentFormat: "mpegts" as const,
      audioStreamIndex: null,
    };
    const first = computePlaybackPolicyHash(base);
    const second = computePlaybackPolicyHash({
      ...base,
      policy: samplePolicy({ hardwareAcceleration: "nvenc", hardwareAccelerationRequired: true }),
    });
    expect(second).not.toBe(first);
  });

  test("acquirePlaybackCache reuses entries and increments ref_count", async () => {
    const sessionA = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const sessionB = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });

    const first = await acquireForSession(sessionA);
    const second = await acquireForSession(sessionB);

    expect(second.cacheId).toBe(first.cacheId);
    expect(second.encodeArtifactDirectory).toBe(first.encodeArtifactDirectory);
    expect(await exists(first.encodeArtifactDirectory)).toBe(true);

    const cache = await db
      .selectFrom("playback_hls_cache")
      .selectAll()
      .where("id", "=", first.cacheId)
      .executeTakeFirstOrThrow();
    expect(cache.ref_count).toBe(2);

    const sessions = await db
      .selectFrom("playback_session")
      .select(["id", "cache_id"])
      .where("id", "in", [sessionA, sessionB])
      .orderBy("id", "asc")
      .execute();
    expect(sessions).toEqual(
      [sessionA, sessionB].sort().map((id) => ({
        id,
        cache_id: first.cacheId,
      })),
    );
  });

  test("releasePlaybackCacheForSession decrements ref_count and clears session cache_id", async () => {
    const sessionA = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const sessionB = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const { cacheId, encodeArtifactDirectory } = await acquireForSession(sessionA);
    await acquireForSession(sessionB);

    await releasePlaybackCacheForSession(sessionA);

    const cache = await db
      .selectFrom("playback_hls_cache")
      .select(["ref_count"])
      .where("id", "=", cacheId)
      .executeTakeFirstOrThrow();
    expect(cache.ref_count).toBe(1);
    expect((await getPlaybackCacheBindingForSession(sessionA)).encodeArtifactDirectory).toBeNull();
    expect((await getPlaybackCacheBindingForSession(sessionB)).encodeArtifactDirectory).toBe(encodeArtifactDirectory);

    await releasePlaybackCacheForSession(sessionB);
    const released = await db
      .selectFrom("playback_hls_cache")
      .select(["ref_count"])
      .where("id", "=", cacheId)
      .executeTakeFirstOrThrow();
    expect(released.ref_count).toBe(0);
    expect(await exists(encodeArtifactDirectory)).toBe(true);
  });

  test("releasePlaybackCacheForSession is idempotent when called repeatedly", async () => {
    const sessionId = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const { cacheId } = await acquireForSession(sessionId);

    await Promise.all([releasePlaybackCacheForSession(sessionId), releasePlaybackCacheForSession(sessionId)]);

    const cache = await db
      .selectFrom("playback_hls_cache")
      .select(["ref_count"])
      .where("id", "=", cacheId)
      .executeTakeFirstOrThrow();
    expect(cache.ref_count).toBe(0);
    expect(
      await db
        .selectFrom("playback_session")
        .select(["cache_id"])
        .where("id", "=", sessionId)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ cache_id: null });
  });

  test("acquirePlaybackCache creates a separate entry when source metadata changes", async () => {
    const sessionA = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const first = await acquireForSession(sessionA);
    const segmentPath = path.join(first.encodeArtifactDirectory, "segment-00000.ts");
    await writeFile(segmentPath, "cached-segment");
    await releasePlaybackCacheForSession(sessionA);

    const sessionB = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const second = await acquireForSession(sessionB, { fileSizeBytes: 200 });

    expect(second.cacheId).not.toBe(first.cacheId);
    expect(await exists(segmentPath)).toBe(true);
    const rows = await db.selectFrom("playback_hls_cache").selectAll().orderBy("file_size_bytes", "asc").execute();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.file_size_bytes)).toEqual([100, 200]);
  });

  test("invalidateStalePlaybackCacheEntries skips entries with active refs", async () => {
    const sessionId = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const { cacheId, encodeArtifactDirectory } = await acquireForSession(sessionId);
    await writeFile(path.join(encodeArtifactDirectory, "segment-00000.ts"), "cached-segment");

    await db
      .updateTable("media_file")
      .set({ size_bytes: 200, mtime_ms: nowMs + 1, updated_at: new Date().toISOString() })
      .where("id", "=", "file-1")
      .execute();

    expect(await invalidateStalePlaybackCacheEntries()).toEqual({ removed: 0 });
    expect(await db.selectFrom("playback_hls_cache").select("id").where("id", "=", cacheId).execute()).toHaveLength(1);
    expect(await exists(encodeArtifactDirectory)).toBe(true);
    await releasePlaybackCacheForSession(sessionId);
  });

  test("invalidateStalePlaybackCacheEntries removes cache rows when media file metadata changes", async () => {
    const sessionId = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const { cacheId, encodeArtifactDirectory } = await acquireForSession(sessionId);
    await writeFile(path.join(encodeArtifactDirectory, "segment-00000.ts"), "cached-segment");
    await releasePlaybackCacheForSession(sessionId);

    await db
      .updateTable("media_file")
      .set({ size_bytes: 200, mtime_ms: nowMs + 1, updated_at: new Date().toISOString() })
      .where("id", "=", "file-1")
      .execute();

    expect(await invalidateStalePlaybackCacheEntries()).toEqual({ removed: 1 });
    expect(await db.selectFrom("playback_hls_cache").select("id").where("id", "=", cacheId).execute()).toHaveLength(0);
    expect(await exists(encodeArtifactDirectory)).toBe(false);
  });

  test("cleanupPlaybackHlsCache evicts idle zero-ref entries after TTL", async () => {
    const sessionId = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const { cacheId, encodeArtifactDirectory } = await acquireForSession(sessionId);
    await releasePlaybackCacheForSession(sessionId);

    await db
      .updateTable("playback_hls_cache")
      .set({ last_access_at: "2000-01-01T00:00:00.000Z", updated_at: "2000-01-01T00:00:00.000Z" })
      .where("id", "=", cacheId)
      .execute();

    expect(await cleanupPlaybackHlsCache(Number.MAX_SAFE_INTEGER, 1)).toEqual({ removed: 1 });
    expect(await exists(encodeArtifactDirectory)).toBe(false);
  });

  test("cleanupPlaybackHlsCache keeps entries with active refs", async () => {
    const sessionId = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const { cacheId, encodeArtifactDirectory } = await acquireForSession(sessionId);

    await db
      .updateTable("playback_hls_cache")
      .set({ last_access_at: "2000-01-01T00:00:00.000Z", updated_at: "2000-01-01T00:00:00.000Z" })
      .where("id", "=", cacheId)
      .execute();

    expect(await cleanupPlaybackHlsCache(Number.MAX_SAFE_INTEGER, 1)).toEqual({ removed: 0 });
    expect(await exists(encodeArtifactDirectory)).toBe(true);
    await releasePlaybackCacheForSession(sessionId);
  });

  test("cleanupPlaybackHlsCache evicts oldest idle entries when over the byte limit", async () => {
    const now = new Date().toISOString();
    const olderAccess = new Date(Date.now() - 10_000).toISOString();
    const newerAccess = new Date(Date.now() - 5_000).toISOString();
    const olderId = computePlaybackCacheId({
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policyHash: "older",
    });
    const newerId = computePlaybackCacheId({
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policyHash: "newer",
    });
    const olderDir = playbackCacheArtifactDirectory(olderId);
    const newerDir = playbackCacheArtifactDirectory(newerId);
    await mkdir(olderDir, { recursive: true });
    await mkdir(newerDir, { recursive: true });
    await writeFile(path.join(olderDir, "segment-00000.ts"), "a".repeat(100));
    await writeFile(path.join(newerDir, "segment-00000.ts"), "b".repeat(200));

    await db
      .insertInto("playback_hls_cache")
      .values([
        {
          id: olderId,
          media_file_id: "file-1",
          mode: "transcode",
          policy_hash: "older",
          file_size_bytes: 100,
          file_mtime_ms: nowMs,
          artifact_dir: olderDir,
          furthest_segment_index: 0,
          bytes: 100,
          ref_count: 0,
          last_access_at: olderAccess,
          created_at: now,
          updated_at: now,
        },
        {
          id: newerId,
          media_file_id: "file-1",
          mode: "transcode",
          policy_hash: "newer",
          file_size_bytes: 100,
          file_mtime_ms: nowMs,
          artifact_dir: newerDir,
          furthest_segment_index: 0,
          bytes: 200,
          ref_count: 0,
          last_access_at: newerAccess,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    expect(await cleanupPlaybackHlsCache(250, 60_000)).toEqual({ removed: 1 });
    expect(await exists(olderDir)).toBe(false);
    expect(await exists(newerDir)).toBe(true);
  });

  test("cleanupPlaybackHlsCache evicts younger idle entries when the oldest entry has active refs", async () => {
    const now = new Date().toISOString();
    const olderAccess = new Date(Date.now() - 10_000).toISOString();
    const newerAccess = new Date(Date.now() - 5_000).toISOString();
    const olderId = computePlaybackCacheId({
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policyHash: "older-active",
    });
    const newerId = computePlaybackCacheId({
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policyHash: "newer-idle",
    });
    const olderDir = playbackCacheArtifactDirectory(olderId);
    const newerDir = playbackCacheArtifactDirectory(newerId);
    await mkdir(olderDir, { recursive: true });
    await mkdir(newerDir, { recursive: true });
    await writeFile(path.join(olderDir, "segment-00000.ts"), "a".repeat(200));
    await writeFile(path.join(newerDir, "segment-00000.ts"), "b".repeat(100));

    await db
      .insertInto("playback_hls_cache")
      .values([
        {
          id: olderId,
          media_file_id: "file-1",
          mode: "transcode",
          policy_hash: "older-active",
          file_size_bytes: 100,
          file_mtime_ms: nowMs,
          artifact_dir: olderDir,
          furthest_segment_index: 0,
          bytes: 200,
          ref_count: 1,
          last_access_at: olderAccess,
          created_at: now,
          updated_at: now,
        },
        {
          id: newerId,
          media_file_id: "file-1",
          mode: "transcode",
          policy_hash: "newer-idle",
          file_size_bytes: 100,
          file_mtime_ms: nowMs,
          artifact_dir: newerDir,
          furthest_segment_index: 0,
          bytes: 100,
          ref_count: 0,
          last_access_at: newerAccess,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    expect(await cleanupPlaybackHlsCache(150, 60_000)).toEqual({ removed: 1 });
    expect(await exists(olderDir)).toBe(true);
    expect(await exists(newerDir)).toBe(false);
  });

  test("switchPlaybackCacheForSession rebinds when source metadata changes during playback", async () => {
    const sessionId = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const first = await acquireForSession(sessionId);
    expect(await isPlaybackCacheEntryStale(first.cacheId)).toBe(false);

    await db
      .updateTable("media_file")
      .set({ size_bytes: 200, mtime_ms: nowMs + 1, updated_at: new Date().toISOString() })
      .where("id", "=", "file-1")
      .execute();

    expect(await isPlaybackCacheEntryStale(first.cacheId)).toBe(true);

    const second = await switchPlaybackCacheForSession({
      sessionId,
      mediaFileId: "file-1",
      fileSizeBytes: 200,
      fileMtimeMs: nowMs + 1,
      mode: "transcode",
      policy: samplePolicy(),
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });

    expect(second.cacheId).not.toBe(first.cacheId);
    expect((await getPlaybackCacheBindingForSession(sessionId)).encodeArtifactDirectory).toBe(
      second.encodeArtifactDirectory,
    );

    const firstCache = await db
      .selectFrom("playback_hls_cache")
      .select(["ref_count"])
      .where("id", "=", first.cacheId)
      .executeTakeFirstOrThrow();
    expect(firstCache.ref_count).toBe(0);

    await releasePlaybackCacheForSession(sessionId);
  });

  test("updatePlaybackCacheStats records furthest segment and byte usage", async () => {
    const sessionId = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const { cacheId, encodeArtifactDirectory } = await acquireForSession(sessionId);
    await writeFile(path.join(encodeArtifactDirectory, "segment-00003.ts"), "segment-bytes");

    await updatePlaybackCacheStats(cacheId, 3);

    const cache = await db
      .selectFrom("playback_hls_cache")
      .select(["furthest_segment_index", "bytes"])
      .where("id", "=", cacheId)
      .executeTakeFirstOrThrow();
    expect(cache.furthest_segment_index).toBe(3);
    expect(cache.bytes).toBeGreaterThan(0);
    expect(await getPlaybackCacheStatus()).toMatchObject({
      entries: 1,
      bytes: cache.bytes,
      activeRefs: 1,
      idleEntries: 0,
    });
    await releasePlaybackCacheForSession(sessionId);
    expect(await getPlaybackCacheStatus()).toMatchObject({
      entries: 1,
      activeRefs: 0,
      idleEntries: 1,
    });
  });

  test("persists encode-ahead segment count settings", async () => {
    await setEncodeAheadSegmentCount(9);
    expect(await getEncodeAheadSegmentCount()).toBe(9);
    await setEncodeAheadSegmentCount(0);
    expect(await getEncodeAheadSegmentCount()).toBeGreaterThan(0);
  });
});
