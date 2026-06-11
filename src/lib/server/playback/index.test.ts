import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { Kysely } from "kysely";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
} from "../db";
import type { Database } from "../db/schema";
import { expectRejectsToThrow } from "$lib/test/async-expect";
import {
  getPlaybackDecision,
  markWatched,
  normalizePlaybackProgress,
  parsePlaybackProgressBody,
  saveProgress,
} from ".";
import {
  setTranscodingEnabled,
  setUserPlaybackPreference,
} from "../transcoding/policy";
import {
  createTranscodeSession,
  registerTranscodeHlsArtifact,
  updateTranscodeSessionStatus,
} from "../transcoding/sessions";
import {
  cancelActivePlaybackSessions,
  cancelPlaybackSession,
  expireIdleReadyHlsPlaybackSessions,
  expireStalePlaybackSessions,
  pruneActiveHlsSegmentArtifacts,
  resolveHlsPlayback,
  setTranscodeBackendForTests,
  setTranscodePolicyRecheckDelayForTests,
  setTranscodeStorageFactoryForTests,
} from "../transcoding/manager";
import type {
  HlsSegmentWindowGeneration,
  HlsSegmentWindowTranscodeInput,
  HlsTranscodeInput,
  RunningTranscode,
} from "../transcoding/backend";

async function writeRequestedWindowSegment(
  input: HlsSegmentWindowTranscodeInput,
  body = "generated",
) {
  const segment = input.segments[0];
  if (!segment) throw new Error("Expected a requested HLS window segment.");
  await mkdir(input.artifactDirectory, { recursive: true });
  await writeFile(path.join(input.artifactDirectory, segment.segment), body);
}

async function completedWindowGeneration(
  input?: HlsSegmentWindowTranscodeInput,
): Promise<HlsSegmentWindowGeneration> {
  if (input) await writeRequestedWindowSegment(input);
  return { completion: Promise.resolve() };
}

function setReadableSftpStorageForTests() {
  setTranscodeStorageFactoryForTests(async () => ({
    source: "sftp",
    async statFile() {
      return null;
    },
    async listFiles() {
      return null;
    },
    async *walkFiles() {
      return;
    },
    async createReadStream() {
      return Readable.from(Buffer.alloc(1024));
    },
    async close() {
      return;
    },
  }));
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for test condition.");
}

describe("parsePlaybackProgressBody", () => {
  test("accepts valid playback progress JSON", () => {
    expect(
      parsePlaybackProgressBody({
        mediaFileId: " file-1 ",
        positionSeconds: 42.5,
        durationSeconds: 120,
        completed: true,
      }),
    ).toEqual({
      mediaFileId: "file-1",
      positionSeconds: 42.5,
      durationSeconds: 120,
      completed: true,
    });
  });

  test("defaults optional progress fields", () => {
    expect(parsePlaybackProgressBody({ mediaFileId: "file-1" })).toEqual({
      mediaFileId: "file-1",
      positionSeconds: 0,
      durationSeconds: null,
      completed: false,
    });
  });

  test("rejects invalid playback progress JSON", () => {
    expect(() => parsePlaybackProgressBody(null)).toThrow(
      "Request body must be a JSON object.",
    );
    expect(() => parsePlaybackProgressBody({ mediaFileId: "" })).toThrow(
      "mediaFileId is required.",
    );
    expect(() =>
      parsePlaybackProgressBody({
        mediaFileId: "file-1",
        positionSeconds: Number.NaN,
      }),
    ).toThrow("Position must be a finite number.");
    expect(() =>
      parsePlaybackProgressBody({
        mediaFileId: "file-1",
        positionSeconds: "45",
      }),
    ).toThrow("Position must be a finite number.");
    expect(() =>
      parsePlaybackProgressBody({
        mediaFileId: "file-1",
        durationSeconds: "nope",
      }),
    ).toThrow("Duration must be a finite number.");
  });
});

describe("normalizePlaybackProgress", () => {
  test("clamps position and duration to playable bounds", () => {
    expect(
      normalizePlaybackProgress({
        positionSeconds: 150,
        durationSeconds: 120,
        completed: false,
      }),
    ).toEqual({
      positionSeconds: 120,
      durationSeconds: 120,
      completed: true,
    });

    expect(
      normalizePlaybackProgress({
        positionSeconds: -10,
        durationSeconds: -1,
        completed: false,
      }),
    ).toEqual({
      positionSeconds: 0,
      durationSeconds: 0,
      completed: false,
    });
  });

  test("infers completion near the end while preserving explicit completion", () => {
    expect(
      normalizePlaybackProgress({
        positionSeconds: 108,
        durationSeconds: 120,
        completed: false,
      }).completed,
    ).toBe(true);

    expect(
      normalizePlaybackProgress({
        positionSeconds: 30,
        durationSeconds: 120,
        completed: true,
      }).completed,
    ).toBe(true);
  });
});

describe("getPlaybackDecision", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-playback-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Test User",
        email: "user@example.com",
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
        path: tempDir,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "movie-1",
          kind: "movie",
          title: "Movie",
          sort_title: "movie",
          year: 2024,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2024-01-01",
          provider: null,
          provider_id: null,
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "show-1",
          kind: "show",
          title: "Show",
          sort_title: "show",
          year: 2024,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2024-01-01",
          provider: null,
          provider_id: null,
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("media_file")
      .values([
        {
          id: "file-a",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "Movie.1080p.mp4"),
          basename: "Movie.1080p.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
        {
          id: "file-b",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "Movie.4k.mp4"),
          basename: "Movie.4k.mp4",
          extension: ".mp4",
          size_bytes: 20,
          mtime_ms: nowMs,
          duration_seconds: 300,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
        {
          id: "show-file",
          library_id: "library-1",
          media_item_id: "show-1",
          path: path.join(tempDir, "Show.mp4"),
          basename: "Show.mp4",
          extension: ".mp4",
          size_bytes: 30,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
        {
          id: "unsupported-file",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "Movie.Hevc.mkv"),
          basename: "Movie.Hevc.mkv",
          extension: ".mkv",
          size_bytes: 40,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: "hevc",
          audio_codec: "dts",
          container: "matroska",
          created_at: now,
          updated_at: now,
        },
        {
          id: "remux-file",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "Movie.Remux.mkv"),
          basename: "Movie.Remux.mkv",
          extension: ".mkv",
          size_bytes: 50,
          mtime_ms: nowMs,
          duration_seconds: 300,
          container: "matroska",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await Promise.all([
      writeFile(path.join(tempDir, "Movie.1080p.mp4"), "fixture"),
      writeFile(path.join(tempDir, "Movie.4k.mp4"), "fixture"),
      writeFile(path.join(tempDir, "Show.mp4"), "fixture"),
      writeFile(path.join(tempDir, "Movie.Hevc.mkv"), "fixture"),
      writeFile(path.join(tempDir, "Movie.Remux.mkv"), "fixture"),
    ]);
    await db
      .insertInto("subtitle_track")
      .values([
        {
          id: "subtitle-shared",
          media_item_id: "movie-1",
          media_file_id: null,
          label: "Shared",
          language: "en",
          source_kind: "external",
          path: path.join(tempDir, "shared.vtt"),
          mime_type: "text/vtt",
          is_default: 1,
          created_at: now,
          updated_at: now,
        },
        {
          id: "subtitle-file-b",
          media_item_id: "movie-1",
          media_file_id: "file-b",
          label: "File B",
          language: "en",
          source_kind: "external",
          path: path.join(tempDir, "file-b.vtt"),
          mime_type: "text/vtt",
          is_default: 0,
          created_at: now,
          updated_at: now,
        },
        {
          id: "subtitle-file-a",
          media_item_id: "movie-1",
          media_file_id: "file-a",
          label: "File A",
          language: "en",
          source_kind: "external",
          path: path.join(tempDir, "file-a.vtt"),
          mime_type: "text/vtt",
          is_default: 0,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
  });

  afterEach(async () => {
    setTranscodeBackendForTests(null);
    setTranscodeStorageFactoryForTests(null);
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("selects a requested media file and only includes applicable subtitles", async () => {
    const decision = await getPlaybackDecision("movie-1", "file-b");

    expect(decision?.file.id).toBe("file-b");
    expect(decision?.mode).toBe("direct");
    expect(decision?.modeDecision).toEqual({
      mode: "direct",
      reason: "direct_supported",
    });
    expect(decision?.streamUrl).toBe("/media/files/file-b/stream");
    expect(decision?.tracks.map((track) => track.id)).toEqual([
      "subtitle-shared",
      "subtitle-file-b",
    ]);
    expect(decision?.tracks.map((track) => track.src)).toEqual([
      "/media/subtitles/subtitle-shared",
      "/media/subtitles/subtitle-file-b",
    ]);
  });

  test("explicit force transcode starts HLS for a direct-play compatible file", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: 60 })
      .where("id", "=", "file-b")
      .execute();
    let linearStartCount = 0;
    let segmentGenerationCount = 0;
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        linearStartCount += 1;
        throw new Error("linear HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        segmentGenerationCount += 1;
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      0,
      {
        forceTranscode: true,
      },
    );

    expect(decision).toMatchObject({
      mode: "transcode",
      status: "ready",
      modeDecision: { mode: "direct", reason: "direct_supported" },
      streamStartSeconds: 0,
    });
    expect(decision?.playbackSessionId).toBeTruthy();
    expect(decision?.streamUrl).toBe(
      `/media/playback-sessions/${decision?.playbackSessionId}/master.m3u8`,
    );
    expect(linearStartCount).toBe(0);
    expect(segmentGenerationCount).toBe(1);
  });

  test("returns at most one default subtitle track", async () => {
    await db
      .updateTable("subtitle_track")
      .set({ is_default: 1 })
      .where("id", "=", "subtitle-file-b")
      .execute();

    const decision = await getPlaybackDecision("movie-1", "file-b");

    expect(
      decision?.tracks.map((track) => ({
        id: track.id,
        default: track.default,
      })),
    ).toEqual([
      { id: "subtitle-file-b", default: true },
      { id: "subtitle-shared", default: false },
    ]);
  });

  test("falls back to the first playable file and rejects files outside the movie", async () => {
    expect((await getPlaybackDecision("movie-1"))?.file.id).toBe("file-a");
    expect(await getPlaybackDecision("movie-1", "missing-file")).toBeNull();
  });

  test("returns clear unavailable playback when request-driven HLS is not available", async () => {
    setTranscodeBackendForTests({
      async startCompatibilityHls() {
        throw new Error("NodeAV test backend unavailable.");
      },
      async cancel() {
        return;
      },
    });
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    const preferredTranscode = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
    );
    expect(preferredTranscode).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      streamUrl: null,
      message: "Request-driven HLS segment generation is not available.",
    });

    const unsupported = await getPlaybackDecision(
      "movie-1",
      "unsupported-file",
      "user-1",
    );
    expect(unsupported).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      streamUrl: null,
    });

    await setTranscodingEnabled(false);
    await setUserPlaybackPreference("user-1", "auto");
    const unavailable = await getPlaybackDecision(
      "movie-1",
      "unsupported-file",
      "user-1",
    );
    expect(unavailable).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "unavailable", reason: "transcoding_disabled" },
      message: "Transcoding is disabled by an administrator.",
    });
  });

  test("does not start linear HLS for a missing local source file", async () => {
    await db
      .updateTable("media_file")
      .set({
        duration_seconds: null,
        path: path.join(tempDir, "Missing.Movie.4k.mp4"),
      })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    let linearStartCount = 0;
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        linearStartCount += 1;
        throw new Error("linear HLS should not start");
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision("movie-1", "file-b", "user-1");
    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      streamUrl: null,
      streamStartSeconds: 0,
      message: "Media file is no longer available.",
    });
    expect(linearStartCount).toBe(0);

    const sessionId = decision?.playbackSessionId;
    if (!sessionId) throw new Error("Expected failed playback session id.");
    const job = await db
      .selectFrom("playback_session")
      .leftJoin(
        "playback_hls_artifact",
        "playback_hls_artifact.playback_session_id",
        "playback_session.id",
      )
      .select([
        "playback_session.status",
        "playback_session.error_message",
        "playback_hls_artifact.path",
      ])
      .where("playback_session.id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Media file is no longer available.",
      path: null,
    });
  });

  test("does not create a playback session when manager policy is disabled", async () => {
    await setTranscodingEnabled(false);

    const decision = await resolveHlsPlayback({
      mediaFileId: "unsupported-file",
      userId: "user-1",
      mode: "transcode",
    });

    expect(decision).toEqual({
      status: "unavailable",
      mode: "transcode",
      sessionId: null,
      streamUrl: null,
      streamStartSeconds: 0,
      message: "Transcoding is disabled by an administrator.",
    });
    expect(
      await db.selectFrom("playback_session").select("id").execute(),
    ).toEqual([]);
  });

  test("does not use linear compatibility HLS for duration-unknown local media by default", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: null })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    let linearStartCount = 0;
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        linearStartCount += 1;
        throw new Error("linear HLS should not start");
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision("movie-1", "file-b", "user-1");
    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      streamUrl: null,
      message: "Request-driven HLS requires known media duration.",
    });
    expect(linearStartCount).toBe(0);

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "pipeline", "error_message"])
      .where("media_file_id", "=", "file-b")
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      pipeline: null,
      error_message: "Request-driven HLS requires known media duration.",
    });
  });

  test("starts request-driven HLS playback for local files with known duration", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: 120 })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    let startCalled = false;
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        startCalled = true;
        throw new Error("linear HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      20,
    );
    expect(decision).toMatchObject({
      mode: "transcode",
      status: "ready",
      streamStartSeconds: 20,
      message: null,
    });
    expect(startCalled).toBe(false);
    expect(decision?.streamUrl).toMatch(
      /^\/media\/playback-sessions\/.+\/master\.m3u8$/,
    );

    const sessionId = decision?.playbackSessionId;
    if (!sessionId)
      throw new Error("Expected request-driven playback session id.");
    expect(decision?.playbackSessionId).toBe(sessionId);

    const job = await db
      .selectFrom("playback_session")
      .leftJoin(
        "playback_hls_artifact",
        "playback_hls_artifact.playback_session_id",
        "playback_session.id",
      )
      .select([
        "playback_session.status",
        "playback_session.pipeline",
        "playback_session.start_time_seconds",
        "playback_hls_artifact.path",
      ])
      .where("playback_session.id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job.status).toBe("running");
    expect(job.pipeline).toBe("request_driven");
    expect(job.start_time_seconds).toBe(20);
    expect(job.path).toBeTruthy();
    expect(await readFile(job.path!, "utf8")).toContain(
      "segments/segment-00000.ts",
    );
  });

  test("does not reuse ready request-driven HLS sessions across playback decisions", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: 120 })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        throw new Error("linear HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const first = await getPlaybackDecision("movie-1", "file-b", "user-1", 20);
    const second = await getPlaybackDecision("movie-1", "file-b", "user-1", 20);

    expect(first).toMatchObject({
      mode: "transcode",
      status: "ready",
      streamStartSeconds: 20,
    });
    expect(second).toMatchObject({
      mode: "transcode",
      status: "ready",
      streamStartSeconds: 20,
    });
    expect(first?.playbackSessionId).toBeTruthy();
    expect(second?.playbackSessionId).toBeTruthy();
    const firstSessionId = first?.playbackSessionId;
    const secondSessionId = second?.playbackSessionId;
    if (!firstSessionId || !secondSessionId) {
      throw new Error(
        "Expected both request-driven playback loads to create sessions.",
      );
    }
    expect(secondSessionId).not.toBe(firstSessionId);
    expect(second?.streamUrl).not.toBe(first?.streamUrl);

    const sessions = await db
      .selectFrom("playback_session")
      .select(["id", "status", "pipeline", "start_time_seconds"])
      .where("media_file_id", "=", "file-b")
      .orderBy("created_at", "asc")
      .execute();
    expect(sessions).toEqual([
      {
        id: firstSessionId,
        status: "running",
        pipeline: "request_driven",
        start_time_seconds: 20,
      },
      {
        id: secondSessionId,
        status: "running",
        pipeline: "request_driven",
        start_time_seconds: 20,
      },
    ]);
  });

  test("does not publish request-driven HLS for a missing local source file", async () => {
    await db
      .updateTable("media_file")
      .set({
        duration_seconds: 120,
        path: path.join(tempDir, "Missing.Movie.4k.mp4"),
      })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    let linearStartCount = 0;
    let segmentGenerationCount = 0;
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        linearStartCount += 1;
        throw new Error("linear HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        segmentGenerationCount += 1;
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      20,
    );
    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      streamUrl: null,
      streamStartSeconds: 20,
      message: "Media file is no longer available.",
    });
    expect(linearStartCount).toBe(0);
    expect(segmentGenerationCount).toBe(0);

    const sessionId = decision?.playbackSessionId;
    if (!sessionId) throw new Error("Expected failed playback session id.");
    const session = await db
      .selectFrom("playback_session")
      .leftJoin(
        "playback_hls_artifact",
        "playback_hls_artifact.playback_session_id",
        "playback_session.id",
      )
      .select([
        "playback_session.status",
        "playback_session.error_message",
        "playback_hls_artifact.path",
      ])
      .where("playback_session.id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({
      status: "failed",
      error_message: "Media file is no longer available.",
      path: null,
    });
  });

  test("does not publish request-driven HLS when bounded-window support is missing", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: 120 })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        throw new Error("linear HLS should not start");
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      20,
    );
    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      streamUrl: null,
      streamStartSeconds: 20,
      message: "Request-driven HLS segment generation is not available.",
    });
  });

  test("does not churn new playback sessions after a recent request-driven HLS failure", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: 120 })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    const failedSessionId = await createTranscodeSession({
      mediaFileId: "file-b",
      userId: "user-1",
      mode: "transcode",
      startTimeSeconds: 20,
    });
    await updateTranscodeSessionStatus(
      failedSessionId,
      "failed",
      "NodeAV generated an invalid HLS segment.",
    );

    let segmentGenerationCount = 0;
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        throw new Error("linear HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        segmentGenerationCount += 1;
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      20,
    );
    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      playbackSessionId: failedSessionId,
      streamUrl: null,
      streamStartSeconds: 20,
      message: "NodeAV generated an invalid HLS segment.",
    });
    expect(segmentGenerationCount).toBe(0);

    const sessions = await db
      .selectFrom("playback_session")
      .select(["id", "status"])
      .where("media_file_id", "=", "file-b")
      .execute();
    expect(sessions).toEqual([{ id: failedSessionId, status: "failed" }]);
  });

  test("does not fall back to linear HLS when request-driven support is missing for known-duration media", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: 120 })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    let linearStartCount = 0;
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        linearStartCount += 1;
        throw new Error("linear HLS should not start");
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      20,
    );
    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      streamUrl: null,
      streamStartSeconds: 20,
      message: "Request-driven HLS segment generation is not available.",
    });
    expect(linearStartCount).toBe(0);

    const sessionId = decision?.playbackSessionId;
    if (!sessionId) throw new Error("Expected failed playback session id.");
    const session = await db
      .selectFrom("playback_session")
      .leftJoin(
        "playback_hls_artifact",
        "playback_hls_artifact.playback_session_id",
        "playback_session.id",
      )
      .select([
        "playback_session.mode",
        "playback_session.status",
        "playback_session.pipeline",
        "playback_session.error_message",
        "playback_hls_artifact.path",
      ])
      .where("playback_session.id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({
      mode: "transcode",
      status: "failed",
      pipeline: null,
      error_message: "Request-driven HLS segment generation is not available.",
      path: null,
    });
  });

  test("does not start HLS work when the requested start is outside known duration", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: 120 })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    let startCount = 0;
    let segmentGenerationCount = 0;
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        startCount += 1;
        throw new Error("linear HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        segmentGenerationCount += 1;
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      120,
    );

    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      streamUrl: null,
      streamStartSeconds: 120,
      message: "Playback start is outside the media duration.",
    });
    expect(startCount).toBe(0);
    expect(segmentGenerationCount).toBe(0);

    const sessionId = decision?.playbackSessionId;
    if (!sessionId) throw new Error("Expected failed playback session id.");
    const job = await db
      .selectFrom("playback_session")
      .leftJoin(
        "playback_hls_artifact",
        "playback_hls_artifact.playback_session_id",
        "playback_session.id",
      )
      .select([
        "playback_session.status",
        "playback_session.error_message",
        "playback_hls_artifact.path",
      ])
      .where("playback_session.id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Playback start is outside the media duration.",
      path: null,
    });
  });

  test("validates request-driven HLS policy before returning a ready playlist", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: 120 })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    const validatedPolicies: Array<{
      hardwareAcceleration: string;
      hardwareAccelerationRequired: boolean;
    }> = [];
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        throw new Error("linear HLS should not start");
      },
      validateHlsSegmentGenerationPolicy(input) {
        validatedPolicies.push({
          hardwareAcceleration: input.hardwareAcceleration,
          hardwareAccelerationRequired: input.hardwareAccelerationRequired,
        });
        throw new Error("NodeAV policy validation failed.");
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      20,
    );
    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      streamUrl: null,
      streamStartSeconds: 20,
      message: "NodeAV policy validation failed.",
    });
    expect(validatedPolicies).toEqual([
      {
        hardwareAcceleration: "off",
        hardwareAccelerationRequired: false,
      },
    ]);

    const sessionId = decision?.playbackSessionId;
    if (!sessionId) throw new Error("Expected failed playback session id.");
    const job = await db
      .selectFrom("playback_session")
      .leftJoin(
        "playback_hls_artifact",
        "playback_hls_artifact.playback_session_id",
        "playback_session.id",
      )
      .select([
        "playback_session.status",
        "playback_session.error_message",
        "playback_hls_artifact.path",
      ])
      .where("playback_session.id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "NodeAV policy validation failed.",
      path: null,
    });
  });

  test("does not publish request-driven HLS playback when policy is disabled during recheck", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: 120 })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    setTranscodePolicyRecheckDelayForTests(async () => {
      await setTranscodingEnabled(false);
    });

    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        throw new Error("linear HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      20,
    );
    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      streamUrl: null,
      streamStartSeconds: 20,
      message: "Transcoding is disabled by an administrator.",
    });

    const sessionId = decision?.playbackSessionId;
    if (!sessionId) throw new Error("Expected failed playback session id.");
    const job = await db
      .selectFrom("playback_session")
      .leftJoin(
        "playback_hls_artifact",
        "playback_hls_artifact.playback_session_id",
        "playback_session.id",
      )
      .select([
        "playback_session.status",
        "playback_session.error_message",
        "playback_hls_artifact.path",
      ])
      .where("playback_session.id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Transcoding is disabled by an administrator.",
      path: null,
    });
  });

  test("does not publish request-driven HLS playback when startup is cancelled during policy recheck", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: 120 })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    let sessionId: string | null = null;
    setTranscodePolicyRecheckDelayForTests(async () => {
      const session = await db
        .selectFrom("playback_session")
        .select("id")
        .where("media_file_id", "=", "file-b")
        .where("status", "=", "queued")
        .orderBy("created_at", "desc")
        .executeTakeFirstOrThrow();
      sessionId = session.id;
      const result = await cancelPlaybackSession(
        session.id,
        "Cancelled during startup.",
      );
      expect(result).toBe("cancelled");
    });

    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        throw new Error("linear HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      20,
    );
    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      streamUrl: null,
      streamStartSeconds: 20,
      message: "Playback session is no longer active.",
    });
    expect(decision?.playbackSessionId).toBe(sessionId);

    const job = await db
      .selectFrom("playback_session")
      .leftJoin(
        "playback_hls_artifact",
        "playback_hls_artifact.playback_session_id",
        "playback_session.id",
      )
      .select([
        "playback_session.status",
        "playback_session.error_message",
        "playback_hls_artifact.path",
      ])
      .where("playback_session.id", "=", decision?.playbackSessionId ?? "")
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      error_message: "Cancelled during startup.",
      path: null,
    });
  });

  test("does not publish request-driven HLS when startup is cancelled before virtual playlist publish", async () => {
    await db
      .updateTable("media_file")
      .set({ duration_seconds: 120 })
      .where("id", "=", "file-b")
      .execute();
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    let sessionId: string | null = null;
    let releasePolicyRecheck: (() => void) | undefined;
    setTranscodePolicyRecheckDelayForTests(async () => {
      const session = await db
        .selectFrom("playback_session")
        .select("id")
        .where("media_file_id", "=", "file-b")
        .where("status", "=", "queued")
        .orderBy("created_at", "desc")
        .executeTakeFirstOrThrow();
      sessionId = session.id;
      await new Promise<void>((resolve) => {
        releasePolicyRecheck = resolve;
      });
    });
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        throw new Error("linear HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decisionPromise = getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      20,
    );
    await waitFor(() => sessionId !== null);

    expect(await cancelPlaybackSession(sessionId!)).toBe("cancelled");
    releasePolicyRecheck?.();
    const decision = await decisionPromise;

    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      streamUrl: null,
      streamStartSeconds: 20,
      message: "Playback session is no longer active.",
    });

    const job = await db
      .selectFrom("playback_session")
      .leftJoin(
        "playback_hls_artifact",
        "playback_hls_artifact.playback_session_id",
        "playback_session.id",
      )
      .select([
        "playback_session.status",
        "playback_session.error_message",
        "playback_hls_artifact.path",
      ])
      .where("playback_session.id", "=", decision?.playbackSessionId ?? "")
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      error_message: "Playback session was cancelled.",
      path: null,
    });
  });

  test("cancels active HLS playback and ignores later backend completion", async () => {
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    let resolveCompletion: (() => void) | undefined;
    let cancelledSessionId: string | null = null;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        await mkdir(input.artifactDirectory, { recursive: true });
        await writeFile(
          path.join(input.artifactDirectory, "segment-00001.ts"),
          "partial",
        );
        return {
          sessionId: input.sessionId,
          playlistPath: path.join(input.artifactDirectory, "master.m3u8"),
          completion,
          async cancel() {
            cancelledSessionId = input.sessionId;
          },
        };
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel(sessionId) {
        cancelledSessionId = sessionId;
      },
    });

    const decision = await getPlaybackDecision("movie-1", "file-b", "user-1");
    expect(decision?.status).toBe("ready");
    const sessionId = decision?.playbackSessionId;
    if (!sessionId) throw new Error("Expected a playback session id.");

    expect(await cancelPlaybackSession(sessionId)).toBe("cancelled");
    expect(String(cancelledSessionId)).toBe(sessionId);

    resolveCompletion?.();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      error_message: "Playback session was cancelled.",
    });
    expect(
      await db
        .selectFrom("playback_hls_artifact")
        .select("id")
        .where("playback_session_id", "=", sessionId)
        .execute(),
    ).toHaveLength(0);
  });

  test("bulk cancellation stops queued and running playback sessions", async () => {
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    const cancelledSessionIds: string[] = [];
    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        return {
          sessionId: input.sessionId,
          playlistPath: path.join(input.artifactDirectory, "master.m3u8"),
          completion: new Promise<void>(() => undefined),
          async cancel() {
            cancelledSessionIds.push(input.sessionId);
          },
        };
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel(sessionId) {
        cancelledSessionIds.push(sessionId);
      },
    });

    const queuedSessionId = await createTranscodeSession({
      mediaFileId: "unsupported-file",
      userId: "user-1",
    });
    const runningDecision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
    );
    const runningSessionId = runningDecision?.playbackSessionId;
    if (!runningSessionId)
      throw new Error("Expected running playback session id.");
    const completedSessionId = await createTranscodeSession({
      mediaFileId: "file-b",
      userId: "user-1",
    });
    await updateTranscodeSessionStatus(completedSessionId, "completed");

    expect(
      await cancelActivePlaybackSessions(
        "Transcoding is disabled by an administrator.",
      ),
    ).toBe(2);

    const jobs = await db
      .selectFrom("playback_session")
      .select(["id", "status", "error_message"])
      .where("id", "in", [
        queuedSessionId,
        runningSessionId,
        completedSessionId,
      ])
      .execute();
    const jobById = new Map(jobs.map((job) => [job.id, job]));
    expect(jobById.get(completedSessionId)).toMatchObject({
      status: "completed",
      error_message: null,
    });
    expect(jobById.get(queuedSessionId)).toMatchObject({
      status: "cancelled",
      error_message: "Transcoding is disabled by an administrator.",
    });
    expect(jobById.get(runningSessionId)).toMatchObject({
      status: "cancelled",
      error_message: "Transcoding is disabled by an administrator.",
    });
    expect(cancelledSessionIds).toContain(queuedSessionId);
    expect(cancelledSessionIds).toContain(runningSessionId);
    expect(cancelledSessionIds).not.toContain(completedSessionId);
  });

  test("expires stale active HLS playback when heartbeat stops", async () => {
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    let cancelledSessionId: string | null = null;
    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        await mkdir(input.artifactDirectory, { recursive: true });
        await writeFile(
          path.join(input.artifactDirectory, "segment-00001.ts"),
          "partial",
        );
        return {
          sessionId: input.sessionId,
          playlistPath: path.join(input.artifactDirectory, "master.m3u8"),
          completion: new Promise<void>(() => undefined),
          async cancel() {
            cancelledSessionId = input.sessionId;
          },
        };
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel(sessionId) {
        cancelledSessionId = sessionId;
      },
    });

    const decision = await getPlaybackDecision("movie-1", "file-b", "user-1");
    const sessionId = decision?.playbackSessionId;
    if (!sessionId) throw new Error("Expected a playback session id.");
    const artifactDir = path.join(
      tempDir,
      "data",
      "playback-sessions",
      sessionId,
    );

    await db
      .updateTable("playback_session")
      .set({
        updated_at: "2000-01-01T00:00:00.000Z",
        last_heartbeat_at: "2000-01-01T00:00:00.000Z",
        last_segment_request_at: null,
      })
      .where("id", "=", sessionId)
      .execute();

    expect(await expireStalePlaybackSessions(1)).toBe(1);
    expect(String(cancelledSessionId)).toBe(sessionId);

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      error_message: "Playback session expired because playback stopped.",
    });
    expect(
      await db
        .selectFrom("playback_hls_artifact")
        .select("id")
        .where("playback_session_id", "=", sessionId)
        .execute(),
    ).toHaveLength(0);
    expect(
      await stat(artifactDir).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  });

  test("keeps ready HLS playback alive while heartbeat continues during buffering", async () => {
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    let cancelledSessionId: string | null = null;
    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        await mkdir(input.artifactDirectory, { recursive: true });
        await writeFile(
          path.join(input.artifactDirectory, "master.m3u8"),
          "#EXTM3U\n",
        );
        await writeFile(
          path.join(input.artifactDirectory, "segment-00001.ts"),
          "partial",
        );
        return {
          sessionId: input.sessionId,
          playlistPath: path.join(input.artifactDirectory, "master.m3u8"),
          completion: new Promise<void>(() => undefined),
          async cancel() {
            cancelledSessionId = input.sessionId;
          },
        };
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel(sessionId) {
        cancelledSessionId = sessionId;
      },
    });

    const decision = await getPlaybackDecision("movie-1", "file-b", "user-1");
    const sessionId = decision?.playbackSessionId;
    if (!sessionId) throw new Error("Expected a playback session id.");
    const artifactDir = path.join(
      tempDir,
      "data",
      "playback-sessions",
      sessionId,
    );

    await db
      .updateTable("playback_session")
      .set({
        updated_at: "2099-01-01T00:00:00.000Z",
        last_heartbeat_at: "2099-01-01T00:00:00.000Z",
        last_segment_request_at: null,
      })
      .where("id", "=", sessionId)
      .execute();
    await db
      .updateTable("playback_hls_artifact")
      .set({ updated_at: "2000-01-01T00:00:00.000Z" })
      .where("playback_session_id", "=", sessionId)
      .execute();

    expect(await expireIdleReadyHlsPlaybackSessions(1)).toBe(0);
    expect(cancelledSessionId).toBeNull();

    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: "2000-01-01T00:00:00.000Z" })
      .where("id", "=", sessionId)
      .execute();

    expect(await expireIdleReadyHlsPlaybackSessions(1)).toBe(1);
    expect(String(cancelledSessionId)).toBe(sessionId);

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      error_message:
        "Playback session expired because playback stopped requesting segments.",
    });
    expect(
      await stat(artifactDir).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  });

  test("prunes active HLS segments behind the consumed playback window", async () => {
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-b",
      userId: "user-1",
    });
    const artifactDir = path.join(
      tempDir,
      "data",
      "playback-sessions",
      sessionId,
    );
    const playlistPath = path.join(artifactDir, "master.m3u8");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(playlistPath, "#EXTM3U\n");
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        writeFile(
          path.join(
            artifactDir,
            `segment-${String(index).padStart(5, "0")}.ts`,
          ),
          "segment",
        ),
      ),
    );
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-b",
      path: playlistPath,
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_segment_index: 6 })
      .where("id", "=", sessionId)
      .execute();

    expect(await pruneActiveHlsSegmentArtifacts(2)).toBe(4);
    expect(
      await stat(path.join(artifactDir, "segment-00000.ts")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(
      await stat(path.join(artifactDir, "segment-00003.ts")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(
      await stat(path.join(artifactDir, "segment-00004.ts")).then(
        () => true,
        () => false,
      ),
    ).toBe(true);
    expect(
      await stat(path.join(artifactDir, "segment-00006.ts")).then(
        () => true,
        () => false,
      ),
    ).toBe(true);
  });

  test("ignores completed HLS artifacts and starts a fresh playback transcode", async () => {
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-b",
      userId: "user-1",
    });
    const artifactDir = path.join(tempDir, "playback-sessions", sessionId);
    const playlistPath = path.join(artifactDir, "master.m3u8");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(playlistPath, "#EXTM3U\n");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-b",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "completed");
    await db
      .updateTable("playback_session")
      .set({
        updated_at: "2000-01-01T00:00:00.000Z",
        last_heartbeat_at: "2000-01-01T00:00:00.000Z",
        last_segment_request_at: null,
      })
      .where("id", "=", sessionId)
      .execute();

    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        return {
          sessionId: input.sessionId,
          playlistPath: path.join(input.artifactDirectory, "master.m3u8"),
          completion: new Promise<void>(() => undefined),
          async cancel() {
            return;
          },
        };
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision("movie-1", "file-b", "user-1");
    expect(decision).toMatchObject({
      mode: "transcode",
      status: "ready",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      message: null,
    });
    expect(decision?.streamUrl).toMatch(
      /^\/media\/playback-sessions\/.+\/master\.m3u8$/,
    );

    const jobs = await db
      .selectFrom("playback_session")
      .select(["id", "status", "error_message"])
      .where("media_file_id", "=", "file-b")
      .orderBy("created_at", "asc")
      .execute();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      id: sessionId,
      status: "completed",
      error_message: null,
    });
    expect(jobs[1]?.status).toBe("running");
  });

  test("does not choose recently completed HLS artifacts for a new playback decision", async () => {
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    const sessionId = await createTranscodeSession({
      mediaFileId: "file-b",
      userId: "user-1",
      startTimeSeconds: 45,
    });
    const artifactDir = path.join(tempDir, "playback-sessions", sessionId);
    const playlistPath = path.join(artifactDir, "master.m3u8");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(playlistPath, "#EXTM3U\n");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-b",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "completed");

    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        return {
          sessionId: input.sessionId,
          playlistPath: path.join(input.artifactDirectory, "master.m3u8"),
          completion: new Promise<void>(() => undefined),
          async cancel() {
            return;
          },
        };
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      45,
    );
    expect(decision).toMatchObject({
      mode: "transcode",
      status: "ready",
      streamStartSeconds: 45,
      message: null,
    });
    expect(decision?.streamUrl).toMatch(
      /^\/media\/playback-sessions\/.+\/master\.m3u8$/,
    );
    expect(decision?.playbackSessionId).not.toBe(sessionId);
  });

  test("does not reuse HLS artifacts from a different playback start offset", async () => {
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    const oldSessionId = await createTranscodeSession({
      mediaFileId: "file-b",
      userId: "user-1",
      startTimeSeconds: 45,
    });
    const oldArtifactDir = path.join(
      tempDir,
      "playback-sessions",
      oldSessionId,
    );
    const oldPlaylistPath = path.join(oldArtifactDir, "master.m3u8");
    await mkdir(oldArtifactDir, { recursive: true });
    await writeFile(oldPlaylistPath, "#EXTM3U\n");
    await registerTranscodeHlsArtifact({
      sessionId: oldSessionId,
      mediaFileId: "file-b",
      path: oldPlaylistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(oldSessionId, "completed");

    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        return {
          sessionId: input.sessionId,
          playlistPath: path.join(input.artifactDirectory, "master.m3u8"),
          completion: new Promise<void>(() => undefined),
          async cancel() {
            return;
          },
        };
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "file-b",
      "user-1",
      0,
    );
    expect(decision).toMatchObject({
      mode: "transcode",
      status: "ready",
      streamStartSeconds: 0,
    });
    expect(decision?.streamUrl).toMatch(
      /^\/media\/playback-sessions\/.+\/master\.m3u8$/,
    );
    expect(decision?.playbackSessionId).not.toBe(oldSessionId);
  });

  test("ignores stale completed HLS artifacts when temporary files are missing", async () => {
    await setUserPlaybackPreference("user-1", "prefer_transcode");
    const staleSessionId = await createTranscodeSession({
      mediaFileId: "file-b",
      userId: "user-1",
    });
    await registerTranscodeHlsArtifact({
      sessionId: staleSessionId,
      mediaFileId: "file-b",
      path: path.join(tempDir, "missing-transcode", "master.m3u8"),
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(staleSessionId, "completed");
    await db
      .updateTable("playback_session")
      .set({
        updated_at: "2000-01-01T00:00:00.000Z",
        last_heartbeat_at: "2000-01-01T00:00:00.000Z",
        last_segment_request_at: null,
      })
      .where("id", "=", staleSessionId)
      .execute();

    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        return {
          sessionId: input.sessionId,
          playlistPath: path.join(input.artifactDirectory, "master.m3u8"),
          completion: new Promise<void>(() => undefined),
          async cancel() {
            return;
          },
        };
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision("movie-1", "file-b", "user-1");
    expect(decision).toMatchObject({
      mode: "transcode",
      status: "ready",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      message: null,
    });
    expect(decision?.streamUrl).toMatch(
      /^\/media\/playback-sessions\/.+\/master\.m3u8$/,
    );

    const jobs = await db
      .selectFrom("playback_session")
      .select(["id", "status", "error_message"])
      .where("media_file_id", "=", "file-b")
      .orderBy("created_at", "asc")
      .execute();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      id: staleSessionId,
      status: "completed",
      error_message: null,
    });
    expect(jobs[1]?.status).toBe("running");
  });

  test("starts request-driven HLS for SFTP media with known duration", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "sftp-request-library",
        name: "Request SFTP Movies",
        kind: "movie",
        source: "sftp",
        path: "sftp://user@example.test:22/movies",
        config_json: "{}",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "sftp-request-file",
        library_id: "sftp-request-library",
        media_item_id: "movie-1",
        path: "/movies/Movie.Request.mkv",
        basename: "Movie.Request.mkv",
        extension: ".mkv",
        size_bytes: 1024,
        mtime_ms: Date.now(),
        duration_seconds: 120,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "matroska",
        created_at: now,
        updated_at: now,
      })
      .execute();

    setReadableSftpStorageForTests();
    setTranscodeBackendForTests({
      async startCompatibilityHls() {
        throw new Error(
          "linear HLS should not start for duration-known SFTP media",
        );
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    const decision = await getPlaybackDecision(
      "movie-1",
      "sftp-request-file",
      "user-1",
      24,
    );
    const sessionId = decision?.playbackSessionId;
    expect(decision).toMatchObject({
      mode: "transcode",
      status: "ready",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      streamUrl: sessionId
        ? `/media/playback-sessions/${sessionId}/master.m3u8`
        : null,
      streamStartSeconds: 24,
      message: null,
    });
    const session = await db
      .selectFrom("playback_session")
      .select(["pipeline", "start_time_seconds"])
      .where("id", "=", sessionId ?? "")
      .executeTakeFirstOrThrow();
    expect(session).toEqual({
      pipeline: "request_driven",
      start_time_seconds: 24,
    });
  });

  test("uses HLS instead of direct streaming for SFTP media in automatic mode", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "sftp-auto-library",
        name: "Auto SFTP Movies",
        kind: "movie",
        source: "sftp",
        path: "sftp://user@example.test:22/movies",
        config_json: "{}",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "sftp-auto-file",
        library_id: "sftp-auto-library",
        media_item_id: "movie-1",
        path: "/movies/Movie.Auto.mp4",
        basename: "Movie.Auto.mp4",
        extension: ".mp4",
        size_bytes: 1024,
        mtime_ms: Date.now(),
        duration_seconds: 120,
        video_codec: "h264",
        audio_codec: "aac",
        container: "mp4",
        created_at: now,
        updated_at: now,
      })
      .execute();

    setReadableSftpStorageForTests();
    setTranscodeBackendForTests({
      async startCompatibilityHls() {
        throw new Error("linear HLS should not start for SFTP auto playback");
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });

    const decision = await getPlaybackDecision(
      "movie-1",
      "sftp-auto-file",
      "user-1",
    );
    const sessionId = decision?.playbackSessionId;
    expect(decision).toMatchObject({
      mode: "remux",
      status: "ready",
      modeDecision: { mode: "remux", reason: "container_unsupported" },
      streamUrl: sessionId
        ? `/media/playback-sessions/${sessionId}/master.m3u8`
        : null,
      message: null,
    });
  });

  test("does not stage seekable SFTP media when request-driven backend support is missing", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "sftp-request-missing-backend-library",
        name: "Request SFTP Movies",
        kind: "movie",
        source: "sftp",
        path: "sftp://user@example.test:22/movies",
        config_json: "{}",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "sftp-request-missing-backend-file",
        library_id: "sftp-request-missing-backend-library",
        media_item_id: "movie-1",
        path: "/movies/Movie.Request.MissingBackend.mkv",
        basename: "Movie.Request.MissingBackend.mkv",
        extension: ".mkv",
        size_bytes: 1024,
        mtime_ms: Date.now(),
        duration_seconds: 120,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "matroska",
        created_at: now,
        updated_at: now,
      })
      .execute();

    let linearStartCount = 0;
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        linearStartCount += 1;
        throw new Error("linear HLS should not start for seekable SFTP media");
      },
      async cancel() {
        return;
      },
    });
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    const decision = await getPlaybackDecision(
      "movie-1",
      "sftp-request-missing-backend-file",
      "user-1",
      24,
    );
    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      streamUrl: null,
      streamStartSeconds: 24,
      message: "Request-driven HLS segment generation is not available.",
    });
    expect(linearStartCount).toBe(0);

    const sessionId = decision?.playbackSessionId;
    if (!sessionId)
      throw new Error("Expected failed SFTP playback session id.");
    const session = await db
      .selectFrom("playback_session")
      .leftJoin(
        "playback_hls_artifact",
        "playback_hls_artifact.playback_session_id",
        "playback_session.id",
      )
      .select([
        "playback_session.mode",
        "playback_session.status",
        "playback_session.pipeline",
        "playback_session.error_message",
        "playback_hls_artifact.path",
      ])
      .where("playback_session.id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({
      mode: "transcode",
      status: "failed",
      pipeline: null,
      error_message: "Request-driven HLS segment generation is not available.",
      path: null,
    });
  });

  test("does not stage known-duration SFTP media when remote size is not seekable", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "sftp-unseekable-library",
        name: "Unseekable SFTP Movies",
        kind: "movie",
        source: "sftp",
        path: "sftp://user@example.test:22/movies",
        config_json: "{}",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "sftp-unseekable-file",
        library_id: "sftp-unseekable-library",
        media_item_id: "movie-1",
        path: "/movies/Movie.Unseekable.mkv",
        basename: "Movie.Unseekable.mkv",
        extension: ".mkv",
        size_bytes: 0,
        mtime_ms: Date.now(),
        duration_seconds: 120,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "matroska",
        created_at: now,
        updated_at: now,
      })
      .execute();

    let storageOpened = false;
    setTranscodeStorageFactoryForTests(async () => {
      storageOpened = true;
      return {
        source: "sftp",
        async statFile() {
          return null;
        },
        async listFiles() {
          return null;
        },
        async *walkFiles() {
          return;
        },
        async createReadStream() {
          return Readable.from("remote-media-body");
        },
        async close() {
          return;
        },
      };
    });

    let segmentGenerationCount = 0;
    let linearStartCount = 0;
    const startedInputs: HlsTranscodeInput[] = [];
    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        linearStartCount += 1;
        startedInputs.push(input);
        throw new Error("compatibility HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        segmentGenerationCount += 1;
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    const decision = await getPlaybackDecision(
      "movie-1",
      "sftp-unseekable-file",
      "user-1",
      24,
    );

    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      streamUrl: null,
      streamStartSeconds: 24,
      message: "SFTP media needs probe metadata before HLS playback can start.",
    });
    expect(storageOpened).toBe(false);
    expect(segmentGenerationCount).toBe(0);
    expect(linearStartCount).toBe(0);
    expect(startedInputs).toEqual([]);
    const sessionId = decision?.playbackSessionId;
    if (!sessionId)
      throw new Error("Expected failed SFTP playback session id.");
    const session = await db
      .selectFrom("playback_session")
      .select(["status", "pipeline", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({
      status: "failed",
      pipeline: null,
      error_message:
        "SFTP media needs probe metadata before HLS playback can start.",
    });
  });

  test("does not stage known-duration SFTP media when remote format is unknown", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "sftp-unknown-format-library",
        name: "Unknown Format SFTP Movies",
        kind: "movie",
        source: "sftp",
        path: "sftp://user@example.test:22/movies",
        config_json: "{}",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "sftp-unknown-format-file",
        library_id: "sftp-unknown-format-library",
        media_item_id: "movie-1",
        path: "/movies/Movie.Remote.video",
        basename: "Movie.Remote.video",
        extension: ".video",
        size_bytes: 1024,
        mtime_ms: Date.now(),
        duration_seconds: 120,
        video_codec: "hevc",
        audio_codec: "dts",
        container: null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    let storageOpened = false;
    setTranscodeStorageFactoryForTests(async () => {
      storageOpened = true;
      return {
        source: "sftp",
        async statFile() {
          return null;
        },
        async listFiles() {
          return null;
        },
        async *walkFiles() {
          return;
        },
        async createReadStream() {
          return Readable.from("remote-media-body");
        },
        async close() {
          return;
        },
      };
    });

    let segmentGenerationCount = 0;
    let linearStartCount = 0;
    const startedInputs: HlsTranscodeInput[] = [];
    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        linearStartCount += 1;
        startedInputs.push(input);
        throw new Error("compatibility HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        segmentGenerationCount += 1;
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    const decision = await getPlaybackDecision(
      "movie-1",
      "sftp-unknown-format-file",
      "user-1",
      24,
    );

    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      streamUrl: null,
      streamStartSeconds: 24,
      message: "SFTP media needs probe metadata before HLS playback can start.",
    });
    expect(storageOpened).toBe(false);
    expect(segmentGenerationCount).toBe(0);
    expect(linearStartCount).toBe(0);
    expect(startedInputs).toEqual([]);
    const sessionId = decision?.playbackSessionId;
    if (!sessionId)
      throw new Error("Expected failed SFTP playback session id.");
    const session = await db
      .selectFrom("playback_session")
      .select(["status", "pipeline", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({
      status: "failed",
      pipeline: null,
      error_message:
        "SFTP media needs probe metadata before HLS playback can start.",
    });
  });

  test("does not stage duration-unknown SFTP media", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "sftp-duration-unknown-library",
        name: "Duration Unknown SFTP Movies",
        kind: "movie",
        source: "sftp",
        path: "sftp://user@example.test:22/movies",
        config_json: "{}",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "sftp-duration-unknown-file",
        library_id: "sftp-duration-unknown-library",
        media_item_id: "movie-1",
        path: "/movies/Movie.Duration.Unknown.mkv",
        basename: "Movie.Duration.Unknown.mkv",
        extension: ".mkv",
        size_bytes: 64 * 1024 * 1024,
        mtime_ms: Date.now(),
        duration_seconds: null,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "matroska",
        created_at: now,
        updated_at: now,
      })
      .execute();

    let storageOpened = false;
    setTranscodeStorageFactoryForTests(async () => {
      storageOpened = true;
      return {
        source: "sftp",
        async statFile() {
          return null;
        },
        async listFiles() {
          return null;
        },
        async *walkFiles() {
          return;
        },
        async createReadStream() {
          return Readable.from("remote-media-body");
        },
        async close() {
          return;
        },
      };
    });

    let segmentGenerationCount = 0;
    let linearStartCount = 0;
    setTranscodeBackendForTests({
      async startCompatibilityHls(): Promise<RunningTranscode> {
        linearStartCount += 1;
        throw new Error("compatibility HLS should not start");
      },
      async generateHlsSegmentWindow(input) {
        segmentGenerationCount += 1;
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      },
    });
    await setUserPlaybackPreference("user-1", "prefer_transcode");

    const decision = await getPlaybackDecision(
      "movie-1",
      "sftp-duration-unknown-file",
      "user-1",
    );
    expect(decision).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      modeDecision: { mode: "transcode", reason: "user_preference" },
      streamUrl: null,
      message: "SFTP media needs probe metadata before HLS playback can start.",
    });
    expect(storageOpened).toBe(false);
    expect(segmentGenerationCount).toBe(0);
    expect(linearStartCount).toBe(0);
    const sessionId = decision?.playbackSessionId;
    expect(typeof sessionId).toBe("string");
    if (typeof sessionId !== "string") {
      throw new Error("Expected failed duration-unknown SFTP session id.");
    }

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "pipeline", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      pipeline: null,
      error_message:
        "SFTP media needs probe metadata before HLS playback can start.",
    });
    const artifacts = await db
      .selectFrom("playback_hls_artifact")
      .select("id")
      .where("playback_session_id", "=", sessionId)
      .execute();
    expect(artifacts).toEqual([]);
  });

  test("rejects non-playable show items for playback and progress", async () => {
    expect(await getPlaybackDecision("show-1")).toBeNull();
    await expectRejectsToThrow(
      saveProgress({
        userId: "user-1",
        mediaItemId: "show-1",
        mediaFileId: "show-file",
        positionSeconds: 12,
        durationSeconds: 120,
        completed: false,
      }),
      "Media file does not belong to a playable item.",
    );
  });

  test("preserves watched state on passive progress saves until explicitly cleared", async () => {
    await markWatched({
      userId: "user-1",
      mediaItemId: "movie-1",
      mediaFileId: "file-a",
      completed: true,
    });
    await markWatched({
      userId: "user-1",
      mediaItemId: "movie-1",
      mediaFileId: "file-b",
      completed: true,
    });
    await saveProgress({
      userId: "user-1",
      mediaItemId: "movie-1",
      mediaFileId: "file-a",
      positionSeconds: 12,
      durationSeconds: 120,
      completed: false,
    });

    const afterPassiveSave = await db
      .selectFrom("watch_progress")
      .selectAll()
      .where("user_id", "=", "user-1")
      .where("media_item_id", "=", "movie-1")
      .where("media_file_id", "=", "file-a")
      .executeTakeFirstOrThrow();
    expect(afterPassiveSave).toMatchObject({
      position_seconds: 12,
      duration_seconds: 120,
      completed: 1,
    });

    const otherCompletedFile = await db
      .selectFrom("watch_progress")
      .selectAll()
      .where("user_id", "=", "user-1")
      .where("media_item_id", "=", "movie-1")
      .where("media_file_id", "=", "file-b")
      .executeTakeFirstOrThrow();
    expect(Boolean(otherCompletedFile.completed)).toBe(true);

    await markWatched({
      userId: "user-1",
      mediaItemId: "movie-1",
      mediaFileId: "file-a",
      completed: false,
    });

    const afterExplicitClear = await db
      .selectFrom("watch_progress")
      .selectAll()
      .where("user_id", "=", "user-1")
      .where("media_item_id", "=", "movie-1")
      .orderBy("media_file_id", "asc")
      .execute();
    expect(afterExplicitClear).toMatchObject([
      {
        media_file_id: "file-a",
        position_seconds: 0,
        duration_seconds: null,
        completed: 0,
      },
      {
        media_file_id: "file-b",
        position_seconds: 0,
        duration_seconds: null,
        completed: 0,
      },
    ]);
  });
});
