import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
} from "../db";
import type { Database } from "../db/schema";
import {
  cleanupExpiredPlaybackSessionArtifacts,
  createTranscodeSession,
  listIdleReadyHlsTranscodeSessions,
  listStaleActiveTranscodeSessions,
  recoverInterruptedTranscodeSessions,
  registerTranscodeHlsArtifact,
  touchTranscodeSessionHeartbeat,
  touchTranscodeSessionSegmentRequest,
  updateTranscodeSessionStatus,
  updateTranscodeSessionPipeline,
} from "./sessions";

describe("transcode sessions", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-transcode-sessions-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
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
        duration_seconds: null,
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

  test("fails interrupted active sessions and removes temporary HLS artifacts", async () => {
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const artifactDir = path.join(tempDir, "playback-sessions", sessionId);
    const playlistPath = path.join(artifactDir, "master.m3u8");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(playlistPath, "#EXTM3U\n");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    expect(await recoverInterruptedTranscodeSessions()).toEqual({
      failed: 1,
      cleaned: 1,
    });

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Playback session was interrupted by a server restart.",
    });
    const artifact = await db
      .selectFrom("playback_hls_artifact")
      .select("id")
      .where("playback_session_id", "=", sessionId)
      .executeTakeFirst();
    expect(artifact).toBeUndefined();
    expect(await exists(artifactDir)).toBe(false);
  });

  test("fails interrupted active sessions without published artifacts and removes safe artifact directories", async () => {
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const artifactDir = path.join(tempDir, "playback-sessions", sessionId);
    await mkdir(artifactDir, { recursive: true });
    await writeFile(path.join(artifactDir, "segment-0001.ts"), "partial");

    expect(await recoverInterruptedTranscodeSessions()).toEqual({
      failed: 1,
      cleaned: 1,
    });

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Playback session was interrupted by a server restart.",
    });
    expect(await exists(artifactDir)).toBe(false);
  });

  test("removes in-progress request-driven segment windows during restart recovery", async () => {
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const artifactDir = path.join(tempDir, "playback-sessions", sessionId);
    const segmentWindowDir = path.join(
      artifactDir,
      ".segment-window-42-restart",
    );
    const playlistPath = path.join(artifactDir, "master.m3u8");
    await mkdir(segmentWindowDir, { recursive: true });
    await writeFile(playlistPath, "#EXTM3U\n");
    await writeFile(path.join(segmentWindowDir, "segment-00000.ts"), "partial");
    await writeFile(path.join(artifactDir, "segment-00042.ts"), "published");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await updateTranscodeSessionPipeline(sessionId, "request_driven");

    expect(await recoverInterruptedTranscodeSessions()).toEqual({
      failed: 1,
      cleaned: 1,
    });

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "pipeline", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      pipeline: "request_driven",
      error_message: "Playback session was interrupted by a server restart.",
    });
    expect(await exists(artifactDir)).toBe(false);
    expect(await exists(segmentWindowDir)).toBe(false);
  });

  test("counts nested playback-session artifact directories once during restart recovery", async () => {
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const artifactDir = path.join(tempDir, "playback-sessions", sessionId);
    const nestedArtifactDir = path.join(artifactDir, "hls");
    const playlistPath = path.join(nestedArtifactDir, "master.m3u8");
    await mkdir(nestedArtifactDir, { recursive: true });
    await writeFile(playlistPath, "#EXTM3U\n");
    await updateTranscodeSessionStatus(sessionId, "running");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });

    expect(await recoverInterruptedTranscodeSessions()).toEqual({
      failed: 1,
      cleaned: 1,
    });
    expect(await exists(artifactDir)).toBe(false);
    const job = await db
      .selectFrom("playback_session")
      .select(["status"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
    });
  });

  test("cleans expired completed, failed, and cancelled playback-session artifacts", async () => {
    const failedSessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const completedSessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const failedArtifactDir = path.join(
      tempDir,
      "playback-sessions",
      failedSessionId,
    );
    const completedArtifactDir = path.join(
      tempDir,
      "playback-sessions",
      completedSessionId,
    );
    await mkdir(failedArtifactDir, { recursive: true });
    await mkdir(completedArtifactDir, { recursive: true });
    await writeFile(path.join(failedArtifactDir, "partial.ts"), "partial");
    await writeFile(
      path.join(completedArtifactDir, "segment-0001.ts"),
      "segment",
    );

    await updateTranscodeSessionStatus(
      failedSessionId,
      "failed",
      "Backend failed.",
    );
    await updateTranscodeSessionStatus(completedSessionId, "completed");
    await registerTranscodeHlsArtifact({
      sessionId: completedSessionId,
      mediaFileId: "file-1",
      path: path.join(completedArtifactDir, "master.m3u8"),
    });
    await db
      .updateTable("playback_session")
      .set({
        updated_at: "2000-01-01T00:00:00.000Z",
        last_heartbeat_at: "2000-01-01T00:00:00.000Z",
        last_segment_request_at: null,
      })
      .where("id", "in", [failedSessionId, completedSessionId])
      .execute();

    expect(await cleanupExpiredPlaybackSessionArtifacts(1)).toEqual({
      sessions: 2,
      cleaned: 2,
    });
    expect(await exists(failedArtifactDir)).toBe(false);
    expect(await exists(completedArtifactDir)).toBe(false);
    const cleanedJobs = await db
      .selectFrom("playback_session")
      .select(["id"])
      .where("id", "in", [failedSessionId, completedSessionId])
      .orderBy("id")
      .execute();
    expect(cleanedJobs).toEqual(
      [{ id: completedSessionId }, { id: failedSessionId }].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    );
    const artifact = await db
      .selectFrom("playback_hls_artifact")
      .select("id")
      .where("playback_session_id", "=", completedSessionId)
      .executeTakeFirst();
    expect(artifact).toBeUndefined();
  });

  test("cleans oldest inactive playback-session artifacts when temporary storage exceeds the size limit", async () => {
    const oldestSessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const middleSessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const newestSessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const oldestArtifactDir = path.join(
      tempDir,
      "playback-sessions",
      oldestSessionId,
    );
    const middleArtifactDir = path.join(
      tempDir,
      "playback-sessions",
      middleSessionId,
    );
    const newestArtifactDir = path.join(
      tempDir,
      "playback-sessions",
      newestSessionId,
    );
    await mkdir(oldestArtifactDir, { recursive: true });
    await mkdir(middleArtifactDir, { recursive: true });
    await mkdir(newestArtifactDir, { recursive: true });
    await writeFile(path.join(oldestArtifactDir, "segment.ts"), "123456");
    await writeFile(path.join(middleArtifactDir, "segment.ts"), "123456");
    await writeFile(path.join(newestArtifactDir, "segment.ts"), "12");

    await updateTranscodeSessionStatus(oldestSessionId, "completed");
    await updateTranscodeSessionStatus(middleSessionId, "completed");
    await updateTranscodeSessionStatus(newestSessionId, "completed");
    await db
      .updateTable("playback_session")
      .set({ updated_at: "2026-01-01T00:00:00.000Z" })
      .where("id", "=", oldestSessionId)
      .execute();
    await db
      .updateTable("playback_session")
      .set({ updated_at: "2026-01-02T00:00:00.000Z" })
      .where("id", "=", middleSessionId)
      .execute();
    await db
      .updateTable("playback_session")
      .set({ updated_at: "2026-01-03T00:00:00.000Z" })
      .where("id", "=", newestSessionId)
      .execute();

    expect(
      await cleanupExpiredPlaybackSessionArtifacts(
        1_000_000_000_000,
        8,
        1_000_000_000_000,
      ),
    ).toEqual({
      sessions: 1,
      cleaned: 1,
    });
    expect(await exists(oldestArtifactDir)).toBe(false);
    expect(await exists(middleArtifactDir)).toBe(true);
    expect(await exists(newestArtifactDir)).toBe(true);
  });

  test("cleans orphaned playback-session artifact directories without deleting active sessions", async () => {
    const activeSessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const playbackSessionArtifactRoot = path.join(tempDir, "playback-sessions");
    const activeArtifactDir = path.join(
      playbackSessionArtifactRoot,
      activeSessionId,
    );
    const orphanArtifactDir = path.join(
      playbackSessionArtifactRoot,
      "orphan-session",
    );
    const freshOrphanArtifactDir = path.join(
      playbackSessionArtifactRoot,
      "fresh-orphan-session",
    );
    await mkdir(activeArtifactDir, { recursive: true });
    await mkdir(orphanArtifactDir, { recursive: true });
    await mkdir(freshOrphanArtifactDir, { recursive: true });
    await writeFile(path.join(activeArtifactDir, "master.m3u8"), "#EXTM3U\n");
    await writeFile(path.join(orphanArtifactDir, "segment.ts"), "orphan");
    await writeFile(path.join(freshOrphanArtifactDir, "segment.ts"), "fresh");

    const oldDate = new Date("2000-01-01T00:00:00.000Z");
    const futureDate = new Date(Date.now() + 60_000);
    await utimes(orphanArtifactDir, oldDate, oldDate);
    await utimes(activeArtifactDir, oldDate, oldDate);
    await utimes(freshOrphanArtifactDir, futureDate, futureDate);

    expect(await cleanupExpiredPlaybackSessionArtifacts(1)).toEqual({
      sessions: 0,
      cleaned: 1,
    });
    expect(await exists(orphanArtifactDir)).toBe(false);
    expect(await exists(activeArtifactDir)).toBe(true);
    expect(await exists(freshOrphanArtifactDir)).toBe(true);
  });

  test("cleans orphaned playback-session artifact directories under size pressure", async () => {
    const playbackSessionArtifactRoot = path.join(tempDir, "playback-sessions");
    const orphanArtifactDir = path.join(
      playbackSessionArtifactRoot,
      "fresh-large-orphan",
    );
    await mkdir(orphanArtifactDir, { recursive: true });
    await writeFile(path.join(orphanArtifactDir, "segment.ts"), "1234567890");

    expect(
      await cleanupExpiredPlaybackSessionArtifacts(
        1_000_000_000_000,
        8,
        1_000_000_000_000,
      ),
    ).toEqual({
      sessions: 0,
      cleaned: 1,
    });
    expect(await exists(orphanArtifactDir)).toBe(false);
  });

  test("expires completed playback artifacts sooner than failed diagnostics by default", async () => {
    const failedSessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const completedSessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const failedArtifactDir = path.join(
      tempDir,
      "playback-sessions",
      failedSessionId,
    );
    const completedArtifactDir = path.join(
      tempDir,
      "playback-sessions",
      completedSessionId,
    );
    await mkdir(failedArtifactDir, { recursive: true });
    await mkdir(completedArtifactDir, { recursive: true });
    await writeFile(path.join(failedArtifactDir, "partial.ts"), "partial");
    await writeFile(path.join(completedArtifactDir, "segment.ts"), "segment");

    await updateTranscodeSessionStatus(
      failedSessionId,
      "failed",
      "Backend failed.",
    );
    await updateTranscodeSessionStatus(completedSessionId, "completed");
    const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();
    await db
      .updateTable("playback_session")
      .set({
        updated_at: twoMinutesAgo,
        last_heartbeat_at: twoMinutesAgo,
        last_segment_request_at: null,
      })
      .where("id", "in", [failedSessionId, completedSessionId])
      .execute();

    expect(await cleanupExpiredPlaybackSessionArtifacts()).toEqual({
      sessions: 1,
      cleaned: 1,
    });
    expect(await exists(completedArtifactDir)).toBe(false);
    expect(await exists(failedArtifactDir)).toBe(true);
  });

  test("expires completed playback artifacts despite recent heartbeat-only activity", async () => {
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const artifactDir = path.join(tempDir, "playback-sessions", sessionId);
    await mkdir(artifactDir, { recursive: true });
    await writeFile(path.join(artifactDir, "segment.ts"), "segment");
    await updateTranscodeSessionStatus(sessionId, "completed");
    await db
      .updateTable("playback_session")
      .set({
        updated_at: "2000-01-01T00:00:00.000Z",
        last_heartbeat_at: new Date().toISOString(),
        last_segment_request_at: null,
      })
      .where("id", "=", sessionId)
      .execute();

    expect(await cleanupExpiredPlaybackSessionArtifacts(1, 1024, 1)).toEqual({
      sessions: 1,
      cleaned: 1,
    });
    expect(await exists(artifactDir)).toBe(false);
  });

  test("tracks active session heartbeat for stale playback cleanup", async () => {
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({
        updated_at: "2000-01-01T00:00:00.000Z",
        last_heartbeat_at: "2000-01-01T00:00:00.000Z",
        last_segment_request_at: null,
      })
      .where("id", "=", sessionId)
      .execute();

    expect(
      await listStaleActiveTranscodeSessions("2001-01-01T00:00:00.000Z"),
    ).toEqual([{ sessionId }]);
    expect(await touchTranscodeSessionHeartbeat(sessionId, "user-1")).toBe(
      true,
    );
    expect(await touchTranscodeSessionHeartbeat(sessionId, "other-user")).toBe(
      false,
    );
    expect(
      await listStaleActiveTranscodeSessions("2001-01-01T00:00:00.000Z"),
    ).toEqual([]);
  });

  test("does not refresh completed sessions from heartbeat alone", async () => {
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    await updateTranscodeSessionStatus(sessionId, "completed");
    await db
      .updateTable("playback_session")
      .set({
        updated_at: oldHeartbeat,
        last_heartbeat_at: oldHeartbeat,
        last_segment_request_at: null,
      })
      .where("id", "=", sessionId)
      .execute();

    expect(await touchTranscodeSessionHeartbeat(sessionId, "user-1")).toBe(
      false,
    );

    const job = await db
      .selectFrom("playback_session")
      .select(["updated_at", "last_heartbeat_at", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      updated_at: oldHeartbeat,
      last_heartbeat_at: oldHeartbeat,
      last_segment_request_at: null,
    });
  });

  test("tracks ready HLS sessions with no recent playback activity", async () => {
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const artifactDir = path.join(tempDir, "playback-sessions", sessionId);
    const playlistPath = path.join(artifactDir, "master.m3u8");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(playlistPath, "#EXTM3U\n");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({
        updated_at: "2099-01-01T00:00:00.000Z",
        last_heartbeat_at: "2000-01-01T00:00:00.000Z",
        last_segment_request_at: null,
      })
      .where("id", "=", sessionId)
      .execute();
    await db
      .updateTable("playback_hls_artifact")
      .set({ updated_at: "2000-01-01T00:00:00.000Z" })
      .where("playback_session_id", "=", sessionId)
      .execute();

    expect(
      await listIdleReadyHlsTranscodeSessions("2001-01-01T00:00:00.000Z"),
    ).toEqual([{ sessionId }]);

    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: "2099-01-01T00:00:00.000Z" })
      .where("id", "=", sessionId)
      .execute();
    expect(
      await listIdleReadyHlsTranscodeSessions("2001-01-01T00:00:00.000Z"),
    ).toEqual([]);

    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: "2000-01-01T00:00:00.000Z" })
      .where("id", "=", sessionId)
      .execute();
    expect(
      await listIdleReadyHlsTranscodeSessions("2001-01-01T00:00:00.000Z"),
    ).toEqual([{ sessionId }]);

    expect(
      await touchTranscodeSessionSegmentRequest(
        sessionId,
        "user-1",
        "segment-00042.ts",
      ),
    ).toBe(true);
    expect(
      await listIdleReadyHlsTranscodeSessions("2001-01-01T00:00:00.000Z"),
    ).toEqual([]);
  });

  test("segment requests keep completed temporary playback artifacts fresh", async () => {
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    const artifactDir = path.join(tempDir, "playback-sessions", sessionId);
    await mkdir(artifactDir, { recursive: true });
    await writeFile(path.join(artifactDir, "segment-00042.ts"), "segment");
    await updateTranscodeSessionStatus(sessionId, "completed");
    await db
      .updateTable("playback_session")
      .set({
        updated_at: "2000-01-01T00:00:00.000Z",
        last_heartbeat_at: "2000-01-01T00:00:00.000Z",
      })
      .where("id", "=", sessionId)
      .execute();

    expect(
      await touchTranscodeSessionSegmentRequest(
        sessionId,
        "user-1",
        "segment-00042.ts",
      ),
    ).toBe(true);

    const job = await db
      .selectFrom("playback_session")
      .select([
        "last_segment_name",
        "last_segment_index",
        "last_segment_request_at",
      ])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job.last_segment_name).toBe("segment-00042.ts");
    expect(job.last_segment_index).toBe(42);
    expect(job.last_segment_request_at).toBeTruthy();

    expect(
      await cleanupExpiredPlaybackSessionArtifacts(1, 1024, 1_000_000),
    ).toEqual({
      sessions: 0,
      cleaned: 0,
    });
    expect(await exists(artifactDir)).toBe(true);
  });

  test("segment request state uses strict HLS segment parsing", async () => {
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    expect(
      await touchTranscodeSessionSegmentRequest(
        sessionId,
        "user-1",
        "movie-00042.mp4",
      ),
    ).toBe(false);

    const arbitraryMp4 = await db
      .selectFrom("playback_session")
      .select([
        "last_segment_name",
        "last_segment_index",
        "last_segment_request_at",
      ])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(arbitraryMp4).toEqual({
      last_segment_name: null,
      last_segment_index: null,
      last_segment_request_at: null,
    });

    expect(
      await touchTranscodeSessionSegmentRequest(
        sessionId,
        "user-1",
        "segment-00042.ts",
      ),
    ).toBe(true);

    const mediaSegment = await db
      .selectFrom("playback_session")
      .select(["last_segment_name", "last_segment_index"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(mediaSegment).toEqual({
      last_segment_name: "segment-00042.ts",
      last_segment_index: 42,
    });
  });
});
