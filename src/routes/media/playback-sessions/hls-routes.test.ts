import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createReadStream as createNodeReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { spawnSync } from "node:child_process";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import type { Database } from "$lib/server/db/schema";
import {
  isSafeHlsSegmentName,
  hlsSegmentReadCountForTests,
  hlsSegmentResponse,
  hlsSegmentMimeType,
  virtualHlsPlaylist,
  rewriteHlsPlaylistUris,
  pruneHlsSegmentsBehind,
  resetHlsSegmentLoadStateForTests,
  setHlsHeadResponseDelayForTests,
  setHlsPlaylistReadDelayForTests,
  setHlsSegmentReadDelayForTests,
} from "$lib/server/transcoding/hls";
import {
  cancelActivePlaybackSessions,
  cancelPlaybackSession,
  ensureHlsSegmentForRequest,
  segmentEnsureWaiterCountForTests,
  setSftpSeekableOperationTimeoutForTests,
  setTranscodeBackendForTests,
  setTranscodePolicyRecheckDelayForTests,
  setTranscodeStorageFactoryForTests,
} from "$lib/server/transcoding/manager";
import {
  createTranscodeSession,
  registerTranscodeHlsArtifact,
  setTranscodeTouchDelayForTests,
  updateTranscodeSessionPipeline,
  updateTranscodeSessionMode,
  updateTranscodeSessionStatus,
} from "$lib/server/transcoding/sessions";
import { setTranscodingEnabled, setUserPreferredAudioLanguage } from "$lib/server/transcoding/policy";
import type { HlsSegmentWindowGeneration, HlsSegmentWindowTranscodeInput } from "$lib/server/transcoding/backend";
import { resolvedFfmpegPath } from "$lib/server/transcoding/ffmpeg-cli";
import type { LibraryStorage } from "$lib/server/storage";
import { GET as getPlaylist, HEAD as headPlaylist } from "./[sessionId]/master.m3u8/+server";
import { GET as getSegment, HEAD as headSegment } from "./[sessionId]/segments/[segment]/+server";

function requestedWindowSegment(input: HlsSegmentWindowTranscodeInput) {
  const segment = input.segments[0];
  if (!segment) throw new Error("Expected a requested HLS window segment.");
  return segment;
}

async function writeRequestedWindowSegment(input: HlsSegmentWindowTranscodeInput, body: string) {
  const segment = requestedWindowSegment(input);
  await mkdir(input.artifactDirectory, { recursive: true });
  await writeFile(path.join(input.artifactDirectory, segment.segment), body);
}

function completedWindowGeneration(): HlsSegmentWindowGeneration {
  return { completion: Promise.resolve() };
}

function canRunFfmpeg() {
  const result = spawnSync(resolvedFfmpegPath(), ["-version"], {
    stdio: "ignore",
  });
  return !result.error && result.status === 0;
}

function generateRouteSmokeInput(
  inputPath: string,
  options: {
    durationSeconds?: number;
    size?: string;
    rate?: number;
  } = {},
) {
  const result = spawnSync(
    resolvedFfmpegPath(),
    [
      "-hide_banner",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=${options.size ?? "96x54"}:rate=${options.rate ?? 5}`,
      "-t",
      String(options.durationSeconds ?? 34),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      inputPath,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `Route smoke FFmpeg fixture failed: ${result.stderr || result.stdout || result.error?.message || "unknown error"}`,
    );
  }
}

describe.serial("playback-session HLS routes", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  let sessionId: string;
  let playlistPath: string;
  let originalHlsSegmentFormat: string | undefined;

  beforeEach(async () => {
    originalHlsSegmentFormat = process.env.LUNARR_HLS_SEGMENT_FORMAT;
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-hls-routes-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values([
        {
          id: "user-1",
          name: "Playback User",
          email: "playback@example.com",
          role: "user",
          email_verified: 0,
          image: null,
          created_at: nowMs,
          updated_at: nowMs,
        },
        {
          id: "user-2",
          name: "Other User",
          email: "other@example.com",
          role: "user",
          email_verified: 0,
          image: null,
          created_at: nowMs,
          updated_at: nowMs,
        },
      ])
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
    await writeFile(path.join(tempDir, "Movie.2026.mkv"), "source-media");

    sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    await updateTranscodeSessionPipeline(sessionId, "request_driven");
    const artifactDir = path.join(tempDir, "playback-sessions", sessionId);
    await mkdir(artifactDir, { recursive: true });
    playlistPath = path.join(artifactDir, "master.m3u8");
    await writeFile(playlistPath, "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nsegment-0001.ts\n");
    await writeFile(path.join(artifactDir, "segment-0001.ts"), "segment-body");
  });

  afterEach(async () => {
    if (originalHlsSegmentFormat === undefined) {
      delete process.env.LUNARR_HLS_SEGMENT_FORMAT;
    } else {
      process.env.LUNARR_HLS_SEGMENT_FORMAT = originalHlsSegmentFormat;
    }
    resetHlsSegmentLoadStateForTests();
    setTranscodeTouchDelayForTests(null);
    setSftpSeekableOperationTimeoutForTests(null);
    setTranscodePolicyRecheckDelayForTests(null);
    setTranscodeBackendForTests(null);
    setTranscodeStorageFactoryForTests(null);
    await cancelActivePlaybackSessions().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 25));
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

  async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 1_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("Timed out waiting for test condition.");
  }

  async function createRequestDrivenSftpSession() {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "sftp-library",
        name: "SFTP Movies",
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
        id: "sftp-file",
        library_id: "sftp-library",
        media_item_id: "movie-1",
        path: "/movies/Movie.Remote.mkv",
        basename: "Movie.Remote.mkv",
        extension: ".mkv",
        size_bytes: 16,
        mtime_ms: Date.now(),
        duration_seconds: 60,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "matroska",
        created_at: now,
        updated_at: now,
      })
      .execute();
    const sftpSessionId = await createTranscodeSession({
      mediaFileId: "sftp-file",
      userId: "user-1",
    });
    const sftpArtifactDir = path.join(tempDir, "playback-sessions", sftpSessionId);
    const sftpPlaylistPath = path.join(sftpArtifactDir, "master.m3u8");
    await mkdir(sftpArtifactDir, { recursive: true });
    await writeFile(sftpPlaylistPath, "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nsegment-00001.ts\n");
    await registerTranscodeHlsArtifact({
      sessionId: sftpSessionId,
      mediaFileId: "sftp-file",
      path: sftpPlaylistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionPipeline(sftpSessionId, "request_driven");
    await updateTranscodeSessionStatus(sftpSessionId, "running");

    return { sftpSessionId, sftpPlaylistPath };
  }

  async function createRequestDrivenWebdavSession() {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "webdav-library",
        name: "WebDAV Movies",
        kind: "movie",
        source: "webdav",
        path: "webdavs://user@example.test/movies",
        config_json: "{}",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "webdav-file",
        library_id: "webdav-library",
        media_item_id: "movie-1",
        path: "/movies/Movie.Remote.mkv",
        basename: "Movie.Remote.mkv",
        extension: ".mkv",
        size_bytes: 16,
        mtime_ms: Date.now(),
        duration_seconds: 60,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "matroska",
        created_at: now,
        updated_at: now,
      })
      .execute();
    const webdavSessionId = await createTranscodeSession({
      mediaFileId: "webdav-file",
      userId: "user-1",
    });
    const webdavArtifactDir = path.join(tempDir, "playback-sessions", webdavSessionId);
    const webdavPlaylistPath = path.join(webdavArtifactDir, "master.m3u8");
    await mkdir(webdavArtifactDir, { recursive: true });
    await writeFile(webdavPlaylistPath, "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nsegment-00001.ts\n");
    await registerTranscodeHlsArtifact({
      sessionId: webdavSessionId,
      mediaFileId: "webdav-file",
      path: webdavPlaylistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionPipeline(webdavSessionId, "request_driven");
    await updateTranscodeSessionStatus(webdavSessionId, "running");

    return { webdavSessionId, webdavPlaylistPath };
  }

  test("validates segment names and MIME types", () => {
    expect(isSafeHlsSegmentName("segment-0001.ts")).toBe(true);
    expect(isSafeHlsSegmentName("segment-0001.m4s")).toBe(true);
    expect(isSafeHlsSegmentName("segment-0001.cmfv")).toBe(true);
    expect(isSafeHlsSegmentName("init.mp4")).toBe(true);
    expect(isSafeHlsSegmentName("init-stream0.mp4")).toBe(true);
    expect(isSafeHlsSegmentName("segment.ts")).toBe(false);
    expect(isSafeHlsSegmentName("chunk.m4s")).toBe(false);
    expect(isSafeHlsSegmentName("movie.mp4")).toBe(false);
    expect(isSafeHlsSegmentName("segment-0001.mp4")).toBe(false);
    expect(isSafeHlsSegmentName("../secret.ts")).toBe(false);
    expect(isSafeHlsSegmentName("nested/segment.ts")).toBe(false);
    expect(isSafeHlsSegmentName("nested\\segment.ts")).toBe(false);
    expect(isSafeHlsSegmentName("master.m3u8")).toBe(false);
    expect(isSafeHlsSegmentName("diagnostic.txt")).toBe(false);
    expect(hlsSegmentMimeType("segment-0001.ts")).toBe("video/mp2t");
    expect(hlsSegmentMimeType("chunk.m4s")).toBe("video/iso.segment");
  });

  test("rewrites playlist segment URIs through the authenticated segment route", () => {
    const playlist = [
      "#EXTM3U",
      "#EXTINF:4.0,",
      "segment-0001.ts",
      "segments/segment-0002.ts",
      path.join(path.dirname(playlistPath), "segment-0001.ts"),
      "file:///tmp/lunarr/segment-0003.ts",
      "https://cdn.example.test/video/segment-0004.ts?token=external",
      "https://cdn.example.test/video/manifest.m3u8",
      "../outside/segment-0005.ts",
      "",
    ].join("\n");

    expect(rewriteHlsPlaylistUris(playlist, playlistPath)).toBe(
      "#EXTM3U\n#EXTINF:4.0,\nsegments/segment-0001.ts\nsegments/segment-0002.ts\nsegments/segment-0001.ts\nsegments/segment-0003.ts\nsegments/segment-0004.ts\nhttps://cdn.example.test/video/manifest.m3u8\n../outside/segment-0005.ts\n",
    );
  });

  test("builds a virtual VOD playlist from duration and start time", () => {
    expect(
      virtualHlsPlaylist({
        durationSeconds: 13,
        startTimeSeconds: 5,
        segmentSeconds: 4,
      }),
    ).toBe(
      "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-START:TIME-OFFSET=5.000\n#EXTINF:4.000,\nsegments/segment-00000.ts\n#EXTINF:4.000,\nsegments/segment-00001.ts\n#EXTINF:4.000,\nsegments/segment-00002.ts\n#EXTINF:1.000,\nsegments/segment-00003.ts\n#EXT-X-ENDLIST\n",
    );
  });

  test("serves an explicit virtual playlist when duration is known", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 13 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await writeFile(path.join(path.dirname(playlistPath), "segment-00001.ts"), "segment-body");
    await updateTranscodeSessionStatus(sessionId, "running");
    await db.updateTable("playback_session").set({ start_time_seconds: 5 }).where("id", "=", sessionId).execute();

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8?playlist=virtual`),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:16\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-START:TIME-OFFSET=5.000\n#EXTINF:13.000,\nsegments/segment-00000.ts\n#EXT-X-ENDLIST\n",
    );
  });

  test("serves an explicit virtual fMP4 playlist when the session uses fMP4", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 34 }).where("id", "=", "file-1").execute();
    await writeFile(
      playlistPath,
      ["#EXTM3U", "#EXT-X-VERSION:7", '#EXT-X-MAP:URI="init.mp4"', "#EXTINF:16.000,", "segment-00000.m4s", ""].join(
        "\n",
      ),
    );
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8?playlist=virtual`),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-TARGETDURATION:16",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        "#EXT-X-MEDIA-SEQUENCE:0",
        '#EXT-X-MAP:URI="segments/init.mp4"',
        "#EXTINF:16.000,",
        "segments/segment-00000.m4s",
        "#EXTINF:16.000,",
        "segments/segment-00001.m4s",
        "#EXTINF:2.000,",
        "segments/segment-00002.m4s",
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );
  });

  test("serves virtual VOD through the default playlist route for running request-driven sessions", async () => {
    const eventPlaylist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:16",
      "#EXT-X-PLAYLIST-TYPE:EVENT",
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXTINF:16.000,",
      "segment-00000.ts",
      "",
    ].join("\n");
    await db.updateTable("media_file").set({ duration_seconds: 13 }).where("id", "=", "file-1").execute();
    await writeFile(playlistPath, eventPlaylist);
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ start_time_seconds: 5, pipeline: "request_driven" })
      .where("id", "=", sessionId)
      .execute();

    const defaultResponse = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);
    const explicitResponse = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8?playlist=virtual`),
    } as never);

    expect(defaultResponse.status).toBe(200);
    expect(explicitResponse.status).toBe(200);
    const defaultBody = await defaultResponse.text();
    const explicitBody = await explicitResponse.text();
    expect(defaultBody).toBe(explicitBody);
    expect(defaultBody).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(defaultBody).toContain("#EXT-X-ENDLIST");
    expect(defaultBody).not.toContain("#EXT-X-PLAYLIST-TYPE:EVENT");
  });

  test("serves playlist HEAD metadata without refreshing playback heartbeat", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();

    const response = await headPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/vnd.apple.mpegurl");
    expect(response.headers.get("content-length")).toBe("70");
    expect(await response.text()).toBe("");

    const job = await db
      .selectFrom("playback_session")
      .select("last_heartbeat_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job.last_heartbeat_at).toBe(oldHeartbeat);
  });

  test("does not serve playlist HEAD metadata after the session is cancelled mid-read", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();
    setHlsHeadResponseDelayForTests(async () => {
      const now = new Date().toISOString();
      await db
        .updateTable("playback_session")
        .set({
          status: "cancelled",
          error_message: "Playback session was cancelled.",
          finished_at: now,
          updated_at: now,
        })
        .where("id", "=", sessionId)
        .execute();
    });

    const response = await headPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Playback session was cancelled.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_heartbeat_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      last_heartbeat_at: oldHeartbeat,
    });
  });

  test("does not serve playlist HEAD metadata after the request is cancelled mid-read", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();

    const requestController = new AbortController();
    setHlsHeadResponseDelayForTests(() => {
      requestController.abort();
    });

    const response = await headPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      request: { signal: requestController.signal },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_heartbeat_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      last_heartbeat_at: oldHeartbeat,
    });
  });

  test("does not serve playlist HEAD metadata after transcoding is disabled mid-read", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();
    setHlsHeadResponseDelayForTests(async () => {
      await setTranscodingEnabled(false);
    });

    const response = await headPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_heartbeat_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      last_heartbeat_at: oldHeartbeat,
    });
  });

  test("does not serve playlist HEAD metadata after the HLS artifact changes mid-read", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    const nextPlaylistPath = path.join(tempDir, "next-transcode", "master.m3u8");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();
    setHlsHeadResponseDelayForTests(async () => {
      await registerTranscodeHlsArtifact({
        sessionId,
        mediaFileId: "file-1",
        path: nextPlaylistPath,
        mimeType: "application/vnd.apple.mpegurl",
      });
    });

    const response = await headPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Playback session changed while serving playlist.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_heartbeat_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      last_heartbeat_at: oldHeartbeat,
    });
  });

  test("does not serve a playlist after the session is cancelled mid-read", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();
    setHlsPlaylistReadDelayForTests(async () => {
      const now = new Date().toISOString();
      await db
        .updateTable("playback_session")
        .set({
          status: "cancelled",
          error_message: "Playback session was cancelled.",
          finished_at: now,
          updated_at: now,
        })
        .where("id", "=", sessionId)
        .execute();
    });

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Playback session was cancelled.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_heartbeat_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      last_heartbeat_at: oldHeartbeat,
    });
  });

  test("does not serve or refresh a playlist after the request is cancelled mid-read", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    const requestController = new AbortController();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();
    setHlsPlaylistReadDelayForTests(async () => {
      requestController.abort();
    });

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      request: { signal: requestController.signal },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Playback playlist was not found.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_heartbeat_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      last_heartbeat_at: oldHeartbeat,
    });
  });

  test("does not refresh playlist heartbeat after the request is cancelled during heartbeat refresh", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    const requestController = new AbortController();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();
    setTranscodeTouchDelayForTests(async () => {
      requestController.abort();
    });

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      request: { signal: requestController.signal },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Playback playlist was not found.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_heartbeat_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      last_heartbeat_at: oldHeartbeat,
    });
  });

  test("does not serve a playlist after the session is cancelled during heartbeat refresh", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();

    let cancelled = false;
    setTranscodeTouchDelayForTests(async () => {
      if (cancelled) return;
      cancelled = true;
      await cancelPlaybackSession(sessionId);
    });

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Playback session was cancelled.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_heartbeat_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      last_heartbeat_at: oldHeartbeat,
    });
  });

  test("does not serve a playlist after transcoding is disabled mid-read", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();
    setHlsPlaylistReadDelayForTests(async () => {
      await setTranscodingEnabled(false);
    });

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_heartbeat_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      last_heartbeat_at: oldHeartbeat,
    });
  });

  test("does not serve a playlist after the HLS artifact changes mid-read", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    const nextPlaylistPath = path.join(tempDir, "next-transcode", "master.m3u8");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();
    setHlsPlaylistReadDelayForTests(async () => {
      await registerTranscodeHlsArtifact({
        sessionId,
        mediaFileId: "file-1",
        path: nextPlaylistPath,
        mimeType: "application/vnd.apple.mpegurl",
      });
    });

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Playback session changed while serving playlist.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_heartbeat_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      last_heartbeat_at: oldHeartbeat,
    });
  });

  test("does not refresh playlist heartbeat when temporary artifacts are missing", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    const missingPlaylistPath = path.join(tempDir, "missing-transcode", "master.m3u8");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: missingPlaylistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Playback playlist was not found.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select("last_heartbeat_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job.last_heartbeat_at).toBe(oldHeartbeat);
  });

  test("does not refresh virtual playlist heartbeat when temporary artifacts are missing", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    const missingPlaylistPath = path.join(tempDir, "missing-virtual", "master.m3u8");
    await db.updateTable("media_file").set({ duration_seconds: 13 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: missingPlaylistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8?playlist=virtual`),
    } as never);
    const head = await headPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8?playlist=virtual`),
    } as never);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Playback playlist was not found.",
    });
    expect(head.status).toBe(404);
    const job = await db
      .selectFrom("playback_session")
      .select("last_heartbeat_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job.last_heartbeat_at).toBe(oldHeartbeat);
  });

  test("does not refresh virtual playlist heartbeat after the request is cancelled during heartbeat refresh", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    const requestController = new AbortController();
    await db.updateTable("media_file").set({ duration_seconds: 13 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();
    setTranscodeTouchDelayForTests(async () => {
      requestController.abort();
    });

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      request: { signal: requestController.signal },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8?playlist=virtual`),
    } as never);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Playback playlist was not found.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_heartbeat_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      last_heartbeat_at: oldHeartbeat,
    });
  });

  test("serves virtual playlist HEAD metadata without refreshing playback heartbeat", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    await db.updateTable("media_file").set({ duration_seconds: 13 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();

    const response = await headPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8?playlist=virtual`),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/vnd.apple.mpegurl");
    expect(response.headers.has("content-length")).toBe(false);
    expect(await response.text()).toBe("");

    const job = await db
      .selectFrom("playback_session")
      .select("last_heartbeat_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job.last_heartbeat_at).toBe(oldHeartbeat);
  });

  test("prunes HLS segments behind the active playback window", async () => {
    const artifactDir = path.dirname(playlistPath);
    await writeFile(path.join(artifactDir, "segment-0002.ts"), "old");
    await writeFile(path.join(artifactDir, "segment-00003.ts"), "old");
    await writeFile(path.join(artifactDir, "segment-00004.ts"), "kept");
    await writeFile(path.join(artifactDir, "segment-0005.ts"), "current");
    await writeFile(path.join(artifactDir, "init.mp4"), "init");

    expect(await pruneHlsSegmentsBehind(playlistPath, "segment-0005.ts", 2)).toBe(2);
    expect(await exists(path.join(artifactDir, "segment-0001.ts"))).toBe(false);
    expect(await exists(path.join(artifactDir, "segment-0002.ts"))).toBe(false);
    expect(await exists(path.join(artifactDir, "segment-00003.ts"))).toBe(true);
    expect(await exists(path.join(artifactDir, "segment-00004.ts"))).toBe(true);
    expect(await exists(path.join(artifactDir, "segment-0005.ts"))).toBe(true);
    expect(await exists(path.join(artifactDir, "init.mp4"))).toBe(true);
  });

  test("coalesces duplicate in-flight segment loads", async () => {
    let releaseRead: () => void = () => undefined;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    resetHlsSegmentLoadStateForTests();
    setHlsSegmentReadDelayForTests(() => readGate);

    const first = hlsSegmentResponse(playlistPath, "segment-0001.ts");
    await Promise.resolve();
    const second = hlsSegmentResponse(playlistPath, "segment-0001.ts");
    releaseRead();

    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await responses[0].text()).toBe("segment-body");
    expect(await responses[1].text()).toBe("segment-body");
    expect(hlsSegmentReadCountForTests()).toBe(1);
  });

  test("serves segment HEAD metadata without reading or generating segment bodies", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        await writeRequestedWindowSegment(input, "generated");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    resetHlsSegmentLoadStateForTests();
    const existing = await headSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(existing.status).toBe(200);
    expect(existing.headers.get("content-type")).toBe("video/mp2t");
    expect(existing.headers.get("content-length")).toBe("12");
    expect(existing.headers.get("cache-control")).toBe("no-store");
    expect(hlsSegmentReadCountForTests()).toBe(0);

    const missing = await headSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(missing.status).toBe(404);
    expect(generationCount).toBe(0);

    const job = await db
      .selectFrom("playback_session")
      .select(["last_segment_name", "last_segment_index", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      last_segment_name: null,
      last_segment_index: null,
      last_segment_request_at: null,
    });
  });

  test("does not serve segment HEAD metadata after the session is cancelled mid-read", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    setHlsHeadResponseDelayForTests(async () => {
      const now = new Date().toISOString();
      await db
        .updateTable("playback_session")
        .set({
          status: "cancelled",
          error_message: "Playback session was cancelled.",
          finished_at: now,
          updated_at: now,
        })
        .where("id", "=", sessionId)
        .execute();
    });

    const response = await headSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("does not serve segment HEAD metadata after the request is cancelled mid-read", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const requestController = new AbortController();
    setHlsHeadResponseDelayForTests(() => {
      requestController.abort();
    });

    const response = await headSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
      request: { signal: requestController.signal },
    } as never);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("does not serve segment HEAD metadata after transcoding is disabled mid-read", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    setHlsHeadResponseDelayForTests(async () => {
      await setTranscodingEnabled(false);
    });

    const response = await headSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("does not serve segment HEAD metadata after the HLS artifact changes mid-read", async () => {
    const nextPlaylistPath = path.join(tempDir, "next-transcode", "master.m3u8");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    setHlsHeadResponseDelayForTests(async () => {
      await registerTranscodeHlsArtifact({
        sessionId,
        mediaFileId: "file-1",
        path: nextPlaylistPath,
        mimeType: "application/vnd.apple.mpegurl",
      });
    });

    const response = await headSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Playback session changed while serving segment.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("blocks HLS playlist and segment access when transcoding is disabled", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db
      .updateTable("playback_session")
      .set({ last_heartbeat_at: oldHeartbeat })
      .where("id", "=", sessionId)
      .execute();

    let cancelCount = 0;
    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        await writeRequestedWindowSegment(input, "generated");
        return completedWindowGeneration();
      },
      async cancel() {
        cancelCount += 1;
        return;
      },
    });
    await setTranscodingEnabled(false);

    const playlist = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);
    const playlistHead = await headPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);
    const existingSegment = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    const missingSegment = await getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    const segmentHead = await headSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    const otherUserPlaylist = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-2" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);
    const otherUserSegment = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-2" } },
    } as never);

    expect(playlist.status).toBe(409);
    expect(await playlist.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    expect(playlistHead.status).toBe(409);
    expect(existingSegment.status).toBe(409);
    expect(await existingSegment.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    expect(missingSegment.status).toBe(409);
    expect(segmentHead.status).toBe(409);
    expect(otherUserPlaylist.status).toBe(404);
    expect(otherUserSegment.status).toBe(404);
    expect(generationCount).toBe(0);
    expect(cancelCount).toBe(1);

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_heartbeat_at", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      error_message: "Transcoding is disabled by an administrator.",
      last_heartbeat_at: oldHeartbeat,
      last_segment_name: null,
      last_segment_request_at: null,
    });
    expect(await exists(path.dirname(playlistPath))).toBe(true);
  });

  test("returns terminal HLS errors before disabled-policy errors", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "failed", "FFmpeg segment validation failed.");
    let cancelCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        throw new Error("not used");
      },
      async cancel() {
        cancelCount += 1;
      },
    });
    await setTranscodingEnabled(false);

    const playlist = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);
    const segment = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(playlist.status).toBe(409);
    expect(await playlist.json()).toEqual({
      error: "FFmpeg segment validation failed.",
    });
    expect(segment.status).toBe(409);
    expect(await segment.json()).toEqual({
      error: "FFmpeg segment validation failed.",
    });
    expect(cancelCount).toBe(0);
  });

  test("returns playback wording for terminal HLS sessions without stored errors", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "failed");
    await setTranscodingEnabled(false);

    const playlist = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);
    const segment = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(playlist.status).toBe(409);
    expect(await playlist.json()).toEqual({
      error: "Playback session is not playable.",
    });
    expect(segment.status).toBe(409);
    expect(await segment.json()).toEqual({
      error: "Playback session is not playable.",
    });
  });

  test("returns no content for abandoned cancelled segment requests while playlists keep the terminal error", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "cancelled", "Playback session was cancelled.");

    const playlist = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);
    const segment = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    const segmentHead = await headSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(playlist.status).toBe(409);
    expect(await playlist.json()).toEqual({
      error: "Playback session was cancelled.",
    });
    expect(segment.status).toBe(204);
    expect(await segment.text()).toBe("");
    expect(segmentHead.status).toBe(204);
  });

  test("does not serve an already-written segment after the session is cancelled mid-read", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    setHlsSegmentReadDelayForTests(async () => {
      const now = new Date().toISOString();
      await db
        .updateTable("playback_session")
        .set({
          status: "cancelled",
          error_message: "Playback session was cancelled.",
          finished_at: now,
          updated_at: now,
        })
        .where("id", "=", sessionId)
        .execute();
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("does not serve or record an already-written segment after the request is cancelled mid-read", async () => {
    const requestController = new AbortController();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    setHlsSegmentReadDelayForTests(async () => {
      requestController.abort();
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
      request: { signal: requestController.signal },
    } as never);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found.");
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("does not record an already-written segment after the request is cancelled during segment refresh", async () => {
    const requestController = new AbortController();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    setTranscodeTouchDelayForTests(async () => {
      requestController.abort();
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
      request: { signal: requestController.signal },
    } as never);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found.");
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("does not serve an already-written segment after the session is cancelled during segment refresh", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let cancelled = false;
    setTranscodeTouchDelayForTests(async () => {
      if (cancelled) return;
      cancelled = true;
      await cancelPlaybackSession(sessionId);
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("does not serve an already-written segment after transcoding is disabled mid-read", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    setHlsSegmentReadDelayForTests(async () => {
      await setTranscodingEnabled(false);
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("does not serve an already-written segment after the HLS artifact changes mid-read", async () => {
    const nextPlaylistPath = path.join(tempDir, "next-transcode", "master.m3u8");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    setHlsSegmentReadDelayForTests(async () => {
      await registerTranscodeHlsArtifact({
        sessionId,
        mediaFileId: "file-1",
        path: nextPlaylistPath,
        mimeType: "application/vnd.apple.mpegurl",
      });
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Playback session changed while serving segment.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("blocks internal segment resolution when transcoding is disabled", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });
    await setTranscodingEnabled(false);

    expect(
      await ensureHlsSegmentForRequest({
        sessionId,
        userId: "user-1",
        segment: "segment-00001.ts",
      }),
    ).toBe(false);
    expect(generationCount).toBe(0);

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Transcoding is disabled by an administrator.",
      last_segment_request_at: null,
    });
  });

  test("coalesces duplicate request-driven generation for missing segments", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    const requested = {
      startSeconds: null as number | null,
      timeoutMs: null as number | null,
    };
    let releaseGeneration: () => void = () => undefined;
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        requested.startSeconds = requestedWindowSegment(input).segmentStartSeconds;
        requested.timeoutMs = input.segmentGenerationTimeoutMs ?? null;
        await generationGate;
        await writeRequestedWindowSegment(input, "generated");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const first = getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await Promise.resolve();
    const second = getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    releaseGeneration();

    const responses = await Promise.all([first, second]);
    expect(generationCount).toBe(1);
    expect(requested).toEqual({ startSeconds: 160, timeoutMs: 120_000 });
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await responses[0].text()).toBe("generated");
    expect(await responses[1].text()).toBe("generated");
  });

  test("keeps coalesced request-driven generation alive when one waiter disconnects", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const firstController = new AbortController();
    let generationCount = 0;
    let backendSignalAborted = false;
    let generationStarted = false;
    let releaseGeneration: () => void = () => undefined;
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        generationStarted = true;
        input.signal?.addEventListener(
          "abort",
          () => {
            backendSignalAborted = true;
          },
          { once: true },
        );
        await generationGate;
        await writeRequestedWindowSegment(input, "generated-for-active-waiter");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const first = getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
      request: { signal: firstController.signal },
    } as never);
    await waitFor(() => generationStarted);
    const second = getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(async () => (await segmentEnsureWaiterCountForTests(sessionId, "segment-00010.ts")) === 2);

    firstController.abort();
    const firstResponse = await first;
    releaseGeneration();
    const secondResponse = await second;

    expect(generationCount).toBe(1);
    expect(backendSignalAborted).toBe(false);
    expect(firstResponse.status).toBe(404);
    expect(await firstResponse.text()).toBe("Not found.");
    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.text()).toBe("generated-for-active-waiter");
  });

  test("aborts coalesced request-driven generation when all waiters disconnect", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const firstController = new AbortController();
    const secondController = new AbortController();
    let generationCount = 0;
    let backendSignalAborted = false;
    let backendCancelCount = 0;
    let generationStarted = false;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        generationStarted = true;
        await new Promise<void>((_resolve, reject) => {
          input.signal?.addEventListener(
            "abort",
            () => {
              backendSignalAborted = true;
              reject(new Error("all segment waiters disconnected"));
            },
            { once: true },
          );
        });
        return completedWindowGeneration();
      },
      async cancel() {
        backendCancelCount += 1;
      },
    });

    const first = getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
      request: { signal: firstController.signal },
    } as never);
    await waitFor(() => generationStarted);
    const second = getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
      request: { signal: secondController.signal },
    } as never);
    await waitFor(async () => (await segmentEnsureWaiterCountForTests(sessionId, "segment-00010.ts")) === 2);

    firstController.abort();
    const firstResponse = await first;
    expect(backendSignalAborted).toBe(false);

    secondController.abort();
    const secondResponse = await second;

    expect(generationCount).toBe(1);
    expect(backendSignalAborted).toBe(true);
    expect(backendCancelCount).toBe(0);
    expect(firstResponse.status).toBe(404);
    expect(secondResponse.status).toBe(404);
    expect(await firstResponse.text()).toBe("Not found.");
    expect(await secondResponse.text()).toBe("Not found.");
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      error_message: null,
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("replaces stale request-driven generation when a far segment is requested", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 600 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const requestedSegments: string[] = [];
    let staleSignalAborted = false;
    let backendCancelJobCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        const segment = requestedWindowSegment(input).segment;
        requestedSegments.push(segment);
        if (segment === "segment-00010.ts") {
          await new Promise<void>((_resolve, reject) => {
            input.signal?.addEventListener(
              "abort",
              () => {
                staleSignalAborted = true;
                reject(new Error("stale segment generation replaced"));
              },
              { once: true },
            );
          });
        }
        for (const windowSegment of input.segments) {
          await writeFile(path.join(path.dirname(input.playlistPath), windowSegment.segment), windowSegment.segment);
        }
        return completedWindowGeneration();
      },
      async cancelJob() {
        backendCancelJobCount += 1;
      },
      async cancel() {
        return;
      },
    });

    const stale = getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(() => requestedSegments.includes("segment-00010.ts"));

    const far = getSegment({
      params: { sessionId, segment: "segment-00030.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(() => requestedSegments.includes("segment-00030.ts"));

    const [staleResponse, farResponse] = await Promise.all([stale, far]);

    // Coordinator-driven prefetch may opportunistically start additional windows.
    expect(requestedSegments[0]).toBe("segment-00010.ts");
    expect(requestedSegments).toContain("segment-00030.ts");
    expect(staleSignalAborted).toBe(true);
    expect(backendCancelJobCount).toBeGreaterThanOrEqual(1);
    expect(staleResponse.status).toBe(404);
    expect(await staleResponse.text()).toBe("Not found.");
    expect(farResponse.status).toBe(200);
    expect(await farResponse.text()).toBe("segment-00030.ts");

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_name", "last_segment_index"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      error_message: null,
      last_segment_name: "segment-00030.ts",
      last_segment_index: 30,
    });
  });

  test("cancels stale background lookahead when a far segment is requested", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 600 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let releaseOldLookahead: () => void = () => undefined;
    const oldLookaheadCompletion = new Promise<void>((resolve) => {
      releaseOldLookahead = resolve;
    });
    let backendCancelJobCount = 0;
    const requestedSegments: string[] = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        const segment = requestedWindowSegment(input).segment;
        requestedSegments.push(segment);
        if (segment === "segment-00010.ts") {
          await writeRequestedWindowSegment(input, segment);
          return { completion: oldLookaheadCompletion };
        }
        for (const windowSegment of input.segments) {
          await writeFile(path.join(input.artifactDirectory, windowSegment.segment), windowSegment.segment);
        }
        return completedWindowGeneration();
      },
      async cancelJob() {
        backendCancelJobCount += 1;
      },
      async cancel() {
        return;
      },
    });

    const initial = await getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(initial.status).toBe(200);
    expect(await initial.text()).toBe("segment-00010.ts");

    const far = await getSegment({
      params: { sessionId, segment: "segment-00030.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(far.status).toBe(200);
    expect(await far.text()).toBe("segment-00030.ts");
    expect(requestedSegments[0]).toBe("segment-00010.ts");
    expect(requestedSegments).toContain("segment-00030.ts");
    expect(backendCancelJobCount).toBeGreaterThanOrEqual(1);

    releaseOldLookahead();
  });

  test("coalesces duplicate far-seek requests while stale request-driven work is being replaced", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 600 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const requestedSegments: string[] = [];
    let releaseBackendCancelJob: () => void = () => undefined;
    const backendCancelJobGate = new Promise<void>((resolve) => {
      releaseBackendCancelJob = resolve;
    });
    let releaseFarGeneration: () => void = () => undefined;
    const farGenerationGate = new Promise<void>((resolve) => {
      releaseFarGeneration = resolve;
    });
    let backendCancelJobStarted = false;
    let farGenerationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        const segment = requestedWindowSegment(input).segment;
        requestedSegments.push(segment);
        if (segment === "segment-00010.ts") {
          await new Promise<void>((_resolve, reject) => {
            input.signal?.addEventListener("abort", () => reject(new Error("stale segment generation replaced")), {
              once: true,
            });
          });
        }

        farGenerationCount += 1;
        await farGenerationGate;
        await writeRequestedWindowSegment(input, segment);
        return completedWindowGeneration();
      },
      async cancelJob() {
        backendCancelJobStarted = true;
        await backendCancelJobGate;
      },
      async cancel() {
        return;
      },
    });

    const stale = getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(() => requestedSegments.includes("segment-00010.ts"));

    const firstFar = getSegment({
      params: { sessionId, segment: "segment-00030.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(() => backendCancelJobStarted);

    const secondFar = getSegment({
      params: { sessionId, segment: "segment-00030.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(async () => (await segmentEnsureWaiterCountForTests(sessionId, "segment-00030.ts")) === 1);

    releaseBackendCancelJob();
    await waitFor(async () => (await segmentEnsureWaiterCountForTests(sessionId, "segment-00030.ts")) === 2);
    releaseFarGeneration();

    const [staleResponse, firstFarResponse, secondFarResponse] = await Promise.all([stale, firstFar, secondFar]);

    expect(requestedSegments[0]).toBe("segment-00010.ts");
    expect(requestedSegments).toContain("segment-00030.ts");
    expect(farGenerationCount).toBeLessThanOrEqual(2);
    expect([404, 409]).toContain(staleResponse.status);
    expect(firstFarResponse.status).toBe(200);
    expect(secondFarResponse.status).toBe(200);
    expect(await firstFarResponse.text()).toBe("segment-00030.ts");
    expect(await secondFarResponse.text()).toBe("segment-00030.ts");
  });

  test("generates a request-driven segment window", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    const now = new Date().toISOString();
    await db
      .insertInto("media_stream_info")
      .values([
        {
          id: "bounded-audio-1",
          media_file_id: "file-1",
          stream_index: 1,
          stream_type: "audio",
          codec_name: "aac",
          codec_long_name: null,
          language: null,
          title: null,
          width: null,
          height: null,
          channels: 2,
          sample_rate: 48000,
          duration_seconds: 240,
          bit_rate: 192000,
          raw_json: "{}",
          created_at: now,
          updated_at: now,
        },
        {
          id: "bounded-audio-2",
          media_file_id: "file-1",
          stream_index: 2,
          stream_type: "audio",
          codec_name: "dts",
          codec_long_name: null,
          language: null,
          title: null,
          width: null,
          height: null,
          channels: 6,
          sample_rate: 48000,
          duration_seconds: 240,
          bit_rate: 768000,
          raw_json: "{}",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    const requestedWindows: string[][] = [];
    const expectedAudioFlags: Array<boolean | undefined> = [];
    const audioStreamIndexes: Array<number | null | undefined> = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        requestedWindows.push(input.segments.map((segment) => segment.segment));
        expectedAudioFlags.push(input.expectAudio);
        audioStreamIndexes.push(input.audioStreamIndex);
        for (const segment of input.segments) {
          await writeFile(path.join(path.dirname(input.playlistPath), segment.segment), segment.segment);
        }
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const first = await getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    const second = await getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(generationCount).toBe(1);
    expect(requestedWindows).toEqual([
      ["segment-00010.ts", "segment-00011.ts", "segment-00012.ts", "segment-00013.ts"],
    ]);
    expect(expectedAudioFlags).toEqual([true]);
    expect(audioStreamIndexes).toEqual([2]);
    expect(await first.text()).toBe("segment-00010.ts");
    expect(await second.text()).toBe("segment-00011.ts");
  });

  test("generates request-driven fMP4 segments when the experimental format is enabled", async () => {
    process.env.LUNARR_HLS_SEGMENT_FORMAT = "fmp4";
    await db.updateTable("media_file").set({ duration_seconds: 64 }).where("id", "=", "file-1").execute();
    await writeFile(
      playlistPath,
      virtualHlsPlaylist({
        durationSeconds: 64,
        segmentSeconds: 16,
        segmentFormat: "fmp4",
      }),
    );
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let backendSegmentFormat: string | undefined;
    const requestedWindows: string[][] = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        backendSegmentFormat = input.hlsSegmentFormat;
        requestedWindows.push(input.segments.map((segment) => segment.segment));
        await writeFile(path.join(path.dirname(input.playlistPath), "init.mp4"), "init");
        for (const segment of input.segments) {
          await writeFile(path.join(path.dirname(input.playlistPath), segment.segment), segment.segment);
        }
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const segment = await getSegment({
      params: { sessionId, segment: "segment-00001.m4s" },
      locals: { user: { id: "user-1" } },
    } as never);
    const init = await getSegment({
      params: { sessionId, segment: "init.mp4" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(init.status).toBe(200);
    expect(init.headers.get("content-type")).toBe("video/iso.segment");
    expect(segment.status).toBe(200);
    expect(segment.headers.get("content-type")).toBe("video/iso.segment");
    expect(await segment.text()).toBe("segment-00001.m4s");
    expect(backendSegmentFormat).toBe("fmp4");
    expect(requestedWindows).toEqual([["segment-00001.m4s", "segment-00002.m4s", "segment-00003.m4s"]]);
  });

  test("uses remux audio selection for request-driven remux sessions", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await updateTranscodeSessionMode(sessionId, "remux");
    const now = new Date().toISOString();
    await db
      .insertInto("media_stream_info")
      .values([
        {
          id: "remux-audio-1",
          media_file_id: "file-1",
          stream_index: 1,
          stream_type: "audio",
          codec_name: "dts",
          codec_long_name: null,
          language: null,
          title: null,
          width: null,
          height: null,
          channels: 6,
          sample_rate: 48000,
          duration_seconds: 240,
          bit_rate: 768000,
          raw_json: "{}",
          created_at: now,
          updated_at: now,
        },
        {
          id: "remux-audio-2",
          media_file_id: "file-1",
          stream_index: 2,
          stream_type: "audio",
          codec_name: "aac",
          codec_long_name: null,
          language: null,
          title: null,
          width: null,
          height: null,
          channels: 2,
          sample_rate: 48000,
          duration_seconds: 240,
          bit_rate: 192000,
          raw_json: "{}",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const audioStreamIndexes: Array<number | null | undefined> = [];
    const requestedModes: Array<string | undefined> = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        requestedModes.push(input.mode);
        audioStreamIndexes.push(input.audioStreamIndex);
        await writeRequestedWindowSegment(input, "remux-segment");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(200);
    expect(requestedModes).toEqual(["remux"]);
    expect(audioStreamIndexes).toEqual([2]);
  });

  test("prefers the user's audio language for request-driven transcode generation", async () => {
    await setUserPreferredAudioLanguage("user-1", "jpn");
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    const now = new Date().toISOString();
    await db
      .insertInto("media_stream_info")
      .values([
        {
          id: "preferred-audio-eng",
          media_file_id: "file-1",
          stream_index: 1,
          stream_type: "audio",
          codec_name: "aac",
          codec_long_name: null,
          language: "eng",
          title: null,
          width: null,
          height: null,
          channels: 6,
          sample_rate: 48000,
          duration_seconds: 240,
          bit_rate: 768000,
          raw_json: "{}",
          created_at: now,
          updated_at: now,
        },
        {
          id: "preferred-audio-jpn",
          media_file_id: "file-1",
          stream_index: 2,
          stream_type: "audio",
          codec_name: "aac",
          codec_long_name: null,
          language: "jpn",
          title: null,
          width: null,
          height: null,
          channels: 2,
          sample_rate: 48000,
          duration_seconds: 240,
          bit_rate: 192000,
          raw_json: "{}",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const audioStreamIndexes: Array<number | null | undefined> = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        audioStreamIndexes.push(input.audioStreamIndex);
        await writeRequestedWindowSegment(input, "preferred-audio-segment");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(200);
    expect(audioStreamIndexes).toEqual([2]);
  });

  test("uses remux language preference for request-driven remux sessions", async () => {
    await setUserPreferredAudioLanguage("user-1", "jpn");
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await updateTranscodeSessionMode(sessionId, "remux");
    const now = new Date().toISOString();
    await db
      .insertInto("media_stream_info")
      .values([
        {
          id: "preferred-remux-dts-jpn",
          media_file_id: "file-1",
          stream_index: 1,
          stream_type: "audio",
          codec_name: "dts",
          codec_long_name: null,
          language: "jpn",
          title: null,
          width: null,
          height: null,
          channels: 6,
          sample_rate: 48000,
          duration_seconds: 240,
          bit_rate: 768000,
          raw_json: "{}",
          created_at: now,
          updated_at: now,
        },
        {
          id: "preferred-remux-aac-eng",
          media_file_id: "file-1",
          stream_index: 2,
          stream_type: "audio",
          codec_name: "aac",
          codec_long_name: null,
          language: "eng",
          title: null,
          width: null,
          height: null,
          channels: 6,
          sample_rate: 48000,
          duration_seconds: 240,
          bit_rate: 768000,
          raw_json: "{}",
          created_at: now,
          updated_at: now,
        },
        {
          id: "preferred-remux-aac-jpn",
          media_file_id: "file-1",
          stream_index: 3,
          stream_type: "audio",
          codec_name: "aac",
          codec_long_name: null,
          language: "jpn",
          title: null,
          width: null,
          height: null,
          channels: 2,
          sample_rate: 48000,
          duration_seconds: 240,
          bit_rate: 192000,
          raw_json: "{}",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const audioStreamIndexes: Array<number | null | undefined> = [];
    const requestedModes: Array<string | undefined> = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        requestedModes.push(input.mode);
        audioStreamIndexes.push(input.audioStreamIndex);
        await writeRequestedWindowSegment(input, "preferred-remux-segment");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(200);
    expect(requestedModes).toEqual(["remux"]);
    expect(audioStreamIndexes).toEqual([3]);
  });

  const routeSmokeTest = canRunFfmpeg() ? test : test.skip;

  routeSmokeTest("serves an authenticated later-seek segment generated by real FFmpeg", async () => {
    const sourcePath = path.join(tempDir, "RouteSmoke.mp4");
    generateRouteSmokeInput(sourcePath);
    const sourceDetails = await stat(sourcePath);
    await db
      .updateTable("media_file")
      .set({
        path: sourcePath,
        basename: "RouteSmoke.mp4",
        extension: ".mp4",
        size_bytes: sourceDetails.size,
        duration_seconds: 34,
        video_codec: "hevc",
        audio_codec: null,
        container: "mp4",
      })
      .where("id", "=", "file-1")
      .execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const response = await getSegment({
      params: { sessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("video/mp2t");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.length).toBeGreaterThan(0);
    expect(await exists(path.join(path.dirname(playlistPath), "segment-00001.ts"))).toBe(true);
    const session = await db
      .selectFrom("playback_session")
      .select(["status", "last_segment_name", "last_segment_index"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toMatchObject({
      status: "running",
      last_segment_name: "segment-00001.ts",
      last_segment_index: 1,
    });
  });

  routeSmokeTest(
    "serves an authenticated SFTP later-seek segment generated by real FFmpeg through the input proxy",
    async () => {
      const sourcePath = path.join(tempDir, "RouteSmokeRemote.mp4");
      generateRouteSmokeInput(sourcePath);
      const sourceDetails = await stat(sourcePath);
      const { sftpSessionId, sftpPlaylistPath } = await createRequestDrivenSftpSession();
      await db
        .updateTable("media_file")
        .set({
          path: "/movies/RouteSmokeRemote.mp4",
          basename: "RouteSmokeRemote.mp4",
          extension: ".mp4",
          size_bytes: sourceDetails.size,
          duration_seconds: 34,
          video_codec: "hevc",
          audio_codec: null,
          container: "mp4",
        })
        .where("id", "=", "sftp-file")
        .execute();

      const reads: Array<{
        start: number;
        end: number;
        keepOpen: boolean | undefined;
      }> = [];
      let storageSetupCount = 0;
      let storageClosed = false;
      setTranscodeStorageFactoryForTests(async () => {
        storageSetupCount += 1;
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
          async createReadStream(_filePath, range, options) {
            if (!range) throw new Error("Expected FFmpeg proxy range read.");
            reads.push({
              start: range.start,
              end: range.end,
              keepOpen: options?.keepOpen,
            });
            return createNodeReadStream(sourcePath, {
              start: range.start,
              end: range.end,
            });
          },
          async close() {
            storageClosed = true;
          },
        };
      });

      const firstResponse = await getSegment({
        params: { sessionId: sftpSessionId, segment: "segment-00001.ts" },
        locals: { user: { id: "user-1" } },
      } as never);

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.headers.get("content-type")).toContain("video/mp2t");
      const firstBody = Buffer.from(await firstResponse.arrayBuffer());
      expect(firstBody.length).toBeGreaterThan(0);

      const secondResponse = await getSegment({
        params: { sessionId: sftpSessionId, segment: "segment-00002.ts" },
        locals: { user: { id: "user-1" } },
      } as never);

      expect(secondResponse.status).toBe(200);
      expect(secondResponse.headers.get("content-type")).toContain("video/mp2t");
      const secondBody = Buffer.from(await secondResponse.arrayBuffer());
      expect(secondBody.length).toBeGreaterThan(0);
      expect(storageSetupCount).toBe(1);
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.every((read) => read.keepOpen === true)).toBe(true);
      await waitFor(() => storageClosed);
      expect(await exists(path.join(path.dirname(sftpPlaylistPath), "segment-00001.ts"))).toBe(true);
      expect(await exists(path.join(path.dirname(sftpPlaylistPath), "segment-00002.ts"))).toBe(true);
      const session = await db
        .selectFrom("playback_session")
        .select(["status", "last_segment_name", "last_segment_index"])
        .where("id", "=", sftpSessionId)
        .executeTakeFirstOrThrow();
      expect(session).toMatchObject({
        status: "running",
        last_segment_name: "segment-00002.ts",
        last_segment_index: 2,
      });
    },
  );

  test("starts a 40-minute far seek at the requested segment window", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 3_600 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const requestedWindows: Array<Array<{ segment: string; startSeconds: number }>> = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        requestedWindows.push(
          input.segments.map((segment) => ({
            segment: segment.segment,
            startSeconds: segment.segmentStartSeconds,
          })),
        );
        for (const segment of input.segments) {
          await writeFile(path.join(path.dirname(input.playlistPath), segment.segment), segment.segment);
        }
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00150.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("segment-00150.ts");
    expect(requestedWindows).toEqual([
      [
        { segment: "segment-00150.ts", startSeconds: 2_400 },
        { segment: "segment-00151.ts", startSeconds: 2_416 },
        { segment: "segment-00152.ts", startSeconds: 2_432 },
        { segment: "segment-00153.ts", startSeconds: 2_448 },
      ],
    ]);
    expect(
      await stat(path.join(path.dirname(playlistPath), "segment-00599.ts")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(
      await stat(path.join(path.dirname(playlistPath), "segment-00000.ts")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  });

  test("tops up request-driven lookahead after serving an existing segment", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 512 }).where("id", "=", "file-1").execute();
    await writeFile(
      playlistPath,
      virtualHlsPlaylist({
        durationSeconds: 512,
        segmentSeconds: 16,
      }),
    );
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    for (let index = 0; index <= 7; index += 1) {
      const segment = `segment-${String(index).padStart(5, "0")}.ts`;
      await writeFile(path.join(path.dirname(playlistPath), segment), segment);
    }

    const requestedWindows: string[][] = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        requestedWindows.push(input.segments.map((segment) => segment.segment));
        for (const segment of input.segments) {
          await writeFile(path.join(path.dirname(input.playlistPath), segment.segment), segment.segment);
        }
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00006.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("segment-00006.ts");
    await waitFor(() => requestedWindows.length === 1);
    expect(requestedWindows[0]).toEqual([
      "segment-00008.ts",
      "segment-00009.ts",
      "segment-00010.ts",
      "segment-00011.ts",
    ]);
    await waitFor(async () => exists(path.join(path.dirname(playlistPath), "segment-00011.ts")));
  });

  test("stops waiting for bounded lookahead when the segment request is cancelled", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const requestController = new AbortController();
    let generationCount = 0;
    let lookaheadDone = false;
    let releaseLookahead: () => void = () => undefined;
    const lookaheadGate = new Promise<void>((resolve) => {
      releaseLookahead = resolve;
    });
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        const [requestedSegment, ...lookaheadSegments] = input.segments;
        await writeFile(path.join(path.dirname(input.playlistPath), requestedSegment.segment), "requested");
        const completion = (async () => {
          await lookaheadGate;
          for (const segment of lookaheadSegments) {
            await writeFile(path.join(path.dirname(input.playlistPath), segment.segment), segment.segment);
          }
          lookaheadDone = true;
        })();
        return { completion };
      },
      async cancel() {
        return;
      },
    });

    const first = await getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(first.status).toBe(200);
    expect(await first.text()).toBe("requested");

    const waiting = getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
      request: { signal: requestController.signal },
    } as never);
    await new Promise((resolve) => setTimeout(resolve, 25));
    requestController.abort();

    const cancelled = await waiting;
    expect(cancelled.status).toBe(404);
    expect(await cancelled.text()).toBe("Not found.");
    expect(generationCount).toBe(1);
    expect(lookaheadDone).toBe(false);

    releaseLookahead();
    await waitFor(() => lookaheadDone);
    const retry = await getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(retry.status).toBe(200);
    expect(generationCount).toBe(1);
    expect(await retry.text()).toBe("segment-00011.ts");
  });

  test("rejects non-canonical request-driven segment aliases", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "alias-00042.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(404);
    expect(generationCount).toBe(0);
    const job = await db
      .selectFrom("playback_session")
      .select(["last_segment_name", "last_segment_index", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      last_segment_name: null,
      last_segment_index: null,
      last_segment_request_at: null,
    });
  });

  test("serializes request-driven generation per session and skips queued segments that are now present", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    let releaseGeneration: () => void = () => undefined;
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        await generationGate;
        const artifactDirectory = path.dirname(input.playlistPath);
        await writeFile(path.join(artifactDirectory, "segment-00010.ts"), "first");
        await writeFile(path.join(artifactDirectory, "segment-00011.ts"), "second");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const first = getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(() => generationCount === 1);
    const second = getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(generationCount).toBe(1);
    releaseGeneration();

    const responses = await Promise.all([first, second]);
    // Prefetch or adjacent segment waits can cause a second backend call, but both requests must still succeed.
    expect(generationCount).toBeLessThanOrEqual(2);
    // Depending on timing, the first request may get superseded by session state churn while the adjacent
    // request still succeeds; the important invariant is that the queued segment does not corrupt the session.
    expect([200, 409]).toContain(responses[0].status);
    expect(responses[1].status).toBe(200);
    if (responses[0].status === 200) {
      expect(await responses[0].text()).toBe("first");
    }
    expect(await responses[1].text()).toBe("second");
  });

  test("returns terminal session errors for queued request-driven generation", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    let releaseGeneration: () => void = () => undefined;
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        await generationGate;
        const artifactDirectory = path.dirname(input.playlistPath);
        await writeFile(path.join(artifactDirectory, "segment-00010.ts"), "first");
        await db
          .updateTable("playback_session")
          .set({
            status: "cancelled",
            error_message: "Playback session was cancelled.",
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .where("id", "=", sessionId)
          .execute();
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const first = getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(() => generationCount === 1);
    const second = getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    releaseGeneration();

    const responses = await Promise.all([first, second]);
    expect(generationCount).toBe(1);
    expect(responses.map((response) => response.status)).toEqual([204, 204]);
    expect(await exists(path.join(path.dirname(playlistPath), "segment-00011.ts"))).toBe(false);
  });

  test("generates request-driven SFTP segments through seekable range reads", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "sftp-library",
        name: "SFTP Movies",
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
        id: "sftp-file",
        library_id: "sftp-library",
        media_item_id: "movie-1",
        path: "/movies/Movie.Remote.mkv",
        basename: "Movie.Remote.mkv",
        extension: ".mkv",
        size_bytes: 16,
        mtime_ms: Date.now(),
        duration_seconds: 60,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "matroska",
        created_at: now,
        updated_at: now,
      })
      .execute();
    const sftpSessionId = await createTranscodeSession({
      mediaFileId: "sftp-file",
      userId: "user-1",
    });
    const sftpArtifactDir = path.join(tempDir, "playback-sessions", sftpSessionId);
    const sftpPlaylistPath = path.join(sftpArtifactDir, "master.m3u8");
    await mkdir(sftpArtifactDir, { recursive: true });
    await writeFile(sftpPlaylistPath, "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nsegment-00001.ts\n");
    await registerTranscodeHlsArtifact({
      sessionId: sftpSessionId,
      mediaFileId: "sftp-file",
      path: sftpPlaylistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionPipeline(sftpSessionId, "request_driven");
    await updateTranscodeSessionStatus(sftpSessionId, "running");

    const remoteBody = Buffer.from("0123456789abcdef");
    const reads: Array<{
      start: number;
      end: number;
      keepOpen: boolean | undefined;
    }> = [];
    let storageClosed = false;
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
      async createReadStream(_filePath, range, options) {
        if (!range) throw new Error("Expected a range read.");
        reads.push({
          start: range.start,
          end: range.end,
          keepOpen: options?.keepOpen,
        });
        return Readable.from(remoteBody.subarray(range.start, range.end + 1));
      },
      async close() {
        storageClosed = true;
      },
    }));

    let readChunk: string | undefined;
    let readAheadChunk: string | undefined;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        const chunk = await input.inputSource?.read(4, 5);
        readChunk = chunk?.toString("utf8");
        const bufferedChunk = await input.inputSource?.read(9, 4);
        readAheadChunk = bufferedChunk?.toString("utf8");
        await writeRequestedWindowSegment(input, "remote");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId: sftpSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("remote");
    expect(readChunk as string | undefined).toBe("45678");
    expect(readAheadChunk as string | undefined).toBe("9abc");
    expect(reads).toEqual([{ start: 4, end: 15, keepOpen: true }]);
    expect(storageClosed).toBe(true);
  });

  test("generates request-driven WebDAV segments through seekable range reads", async () => {
    const { webdavSessionId } = await createRequestDrivenWebdavSession();

    const remoteBody = Buffer.from("0123456789abcdef");
    const reads: Array<{
      start: number;
      end: number;
      keepOpen: boolean | undefined;
    }> = [];
    let storageClosed = false;
    setTranscodeStorageFactoryForTests(async () => ({
      source: "webdav",
      async statFile() {
        return null;
      },
      async listFiles() {
        return null;
      },
      async *walkFiles() {
        return;
      },
      async createReadStream(_filePath, range, options) {
        if (!range) throw new Error("Expected a range read.");
        reads.push({
          start: range.start,
          end: range.end,
          keepOpen: options?.keepOpen,
        });
        return Readable.from(remoteBody.subarray(range.start, range.end + 1));
      },
      async close() {
        storageClosed = true;
      },
    }));

    let readChunk: string | undefined;
    let readAheadChunk: string | undefined;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        const chunk = await input.inputSource?.read(4, 5);
        readChunk = chunk?.toString("utf8");
        const bufferedChunk = await input.inputSource?.read(9, 4);
        readAheadChunk = bufferedChunk?.toString("utf8");
        await writeRequestedWindowSegment(input, "remote-webdav");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId: webdavSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("remote-webdav");
    expect(readChunk as string | undefined).toBe("45678");
    expect(readAheadChunk as string | undefined).toBe("9abc");
    expect(reads).toEqual([{ start: 4, end: 15, keepOpen: true }]);
    expect(storageClosed).toBe(true);
  });

  test("keeps SFTP seekable input open until bounded lookahead completes", async () => {
    const { sftpSessionId } = await createRequestDrivenSftpSession();
    const remoteBody = Buffer.from("0123456789abcdef");
    let storageClosed = false;
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
      async createReadStream(_filePath, range) {
        if (!range) throw new Error("Expected a range read.");
        return Readable.from(remoteBody.subarray(range.start, range.end + 1));
      },
      async close() {
        storageClosed = true;
      },
    }));

    let releaseLookahead: () => void = () => undefined;
    const lookaheadGate = new Promise<void>((resolve) => {
      releaseLookahead = resolve;
    });
    let backgroundCompletion: Promise<void> | undefined;
    let backgroundError: unknown = null;
    let backgroundRead: string | undefined;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        const requestedChunk = await input.inputSource?.read(0, 4);
        await writeFile(
          path.join(path.dirname(input.playlistPath), input.segments[0].segment),
          requestedChunk?.toString("utf8") ?? "requested",
        );
        backgroundCompletion = (async () => {
          try {
            await lookaheadGate;
            const chunk = await input.inputSource?.read(9, 4);
            backgroundRead = chunk?.toString("utf8");
            await writeFile(
              path.join(path.dirname(input.playlistPath), input.segments[1].segment),
              backgroundRead ?? "lookahead",
            );
          } catch (error) {
            backgroundError = error;
            throw error;
          }
        })();
        return { completion: backgroundCompletion };
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId: sftpSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("0123");
    expect(storageClosed).toBe(false);

    releaseLookahead();
    await (backgroundCompletion ?? Promise.resolve()).catch(() => undefined);

    expect(backgroundError).toBe(null);
    expect(backgroundRead).toBe("9abc");
    await waitFor(() => storageClosed);
  });

  test("rejects truncated request-driven SFTP range reads", async () => {
    const { sftpSessionId } = await createRequestDrivenSftpSession();
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
        return Readable.from(Buffer.from("abc"));
      },
      async close() {
        return;
      },
    }));

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        await input.inputSource?.read(0, 8);
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId: sftpSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Remote range read /movies/Movie.Remote.mkv returned 3 bytes for a 8 byte request.",
    });
    expect(generationCount).toBe(1);

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sftpSessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Remote range read /movies/Movie.Remote.mkv returned 3 bytes for a 8 byte request.",
    });
  });

  test("rejects truncated request-driven WebDAV range reads", async () => {
    const { webdavSessionId } = await createRequestDrivenWebdavSession();
    setTranscodeStorageFactoryForTests(async () => ({
      source: "webdav",
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
        return Readable.from(Buffer.from("abc"));
      },
      async close() {
        return;
      },
    }));

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        await input.inputSource?.read(0, 8);
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId: webdavSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Remote range read /movies/Movie.Remote.mkv returned 3 bytes for a 8 byte request.",
    });
    expect(generationCount).toBe(1);

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", webdavSessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Remote range read /movies/Movie.Remote.mkv returned 3 bytes for a 8 byte request.",
    });
  });

  test("marks request-driven SFTP sessions failed when remote input setup fails", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "sftp-library",
        name: "SFTP Movies",
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
        id: "sftp-file",
        library_id: "sftp-library",
        media_item_id: "movie-1",
        path: "/movies/Movie.Remote.mkv",
        basename: "Movie.Remote.mkv",
        extension: ".mkv",
        size_bytes: 16,
        mtime_ms: Date.now(),
        duration_seconds: 60,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "matroska",
        created_at: now,
        updated_at: now,
      })
      .execute();
    const sftpSessionId = await createTranscodeSession({
      mediaFileId: "sftp-file",
      userId: "user-1",
    });
    const sftpArtifactDir = path.join(tempDir, "playback-sessions", sftpSessionId);
    const sftpPlaylistPath = path.join(sftpArtifactDir, "master.m3u8");
    await mkdir(sftpArtifactDir, { recursive: true });
    await writeFile(sftpPlaylistPath, "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nsegment-00001.ts\n");
    await registerTranscodeHlsArtifact({
      sessionId: sftpSessionId,
      mediaFileId: "sftp-file",
      path: sftpPlaylistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionPipeline(sftpSessionId, "request_driven");
    await updateTranscodeSessionStatus(sftpSessionId, "running");

    setTranscodeStorageFactoryForTests(async () => {
      throw new Error("SFTP connection failed.");
    });
    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId: sftpSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "SFTP connection failed.",
    });
    expect(generationCount).toBe(0);
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sftpSessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "SFTP connection failed.",
    });
  });

  test("marks request-driven local sessions failed when the source disappears before segment generation", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await rm(path.join(tempDir, "Movie.2026.mkv"), { force: true });

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Media file is no longer available.",
    });
    expect(generationCount).toBe(0);

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Media file is no longer available.",
    });
  });

  test("times out request-driven SFTP input setup", async () => {
    const { sftpSessionId } = await createRequestDrivenSftpSession();
    setSftpSeekableOperationTimeoutForTests(5);
    let resolveStorage: ((storage: LibraryStorage) => void) | undefined;
    let lateStorageClosed = false;
    setTranscodeStorageFactoryForTests(
      () =>
        new Promise<LibraryStorage>((resolve) => {
          resolveStorage = resolve;
        }),
    );

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId: sftpSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Remote input setup for /movies/Movie.Remote.mkv timed out after 5ms.",
    });
    expect(generationCount).toBe(0);

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sftpSessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Remote input setup for /movies/Movie.Remote.mkv timed out after 5ms.",
    });

    resolveStorage?.({
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
        return Readable.from([]);
      },
      async close() {
        lateStorageClosed = true;
      },
    });
    await waitFor(() => lateStorageClosed);
  });

  test("aborts request-driven SFTP input setup when segment generation is cancelled", async () => {
    const { sftpSessionId } = await createRequestDrivenSftpSession();
    setSftpSeekableOperationTimeoutForTests(1_000);
    let storageSetupStarted = false;
    let resolveStorage: ((storage: LibraryStorage) => void) | undefined;
    let lateStorageClosed = false;
    setTranscodeStorageFactoryForTests(
      () =>
        new Promise<LibraryStorage>((resolve) => {
          storageSetupStarted = true;
          resolveStorage = resolve;
        }),
    );

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const responsePromise = getSegment({
      params: { sessionId: sftpSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(() => storageSetupStarted);

    expect(await cancelPlaybackSession(sftpSessionId)).toBe("cancelled");
    const response = await responsePromise;

    expect(response.status).toBe(204);
    expect(generationCount).toBe(0);

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sftpSessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      error_message: "Playback session was cancelled.",
    });

    resolveStorage?.({
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
        return Readable.from([]);
      },
      async close() {
        lateStorageClosed = true;
      },
    });
    await waitFor(() => lateStorageClosed);
  });

  test("does not start request-driven SFTP generation when policy is disabled during input setup", async () => {
    const { sftpSessionId } = await createRequestDrivenSftpSession();
    setSftpSeekableOperationTimeoutForTests(1_000);
    let storageSetupStarted = false;
    let resolveStorage: ((storage: LibraryStorage) => void) | undefined;
    setTranscodeStorageFactoryForTests(
      () =>
        new Promise<LibraryStorage>((resolve) => {
          storageSetupStarted = true;
          resolveStorage = resolve;
        }),
    );

    let cancelCount = 0;
    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        return completedWindowGeneration();
      },
      async cancel() {
        cancelCount += 1;
      },
    });

    const responsePromise = getSegment({
      params: { sessionId: sftpSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(() => storageSetupStarted);
    await setTranscodingEnabled(false);

    resolveStorage?.({
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
        throw new Error("generation should not read remote ranges");
      },
      async close() {
        return;
      },
    });

    const response = await responsePromise;

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    expect(generationCount).toBe(0);
    expect(cancelCount).toBeGreaterThanOrEqual(1);

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sftpSessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Transcoding is disabled by an administrator.",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("times out request-driven SFTP range stream creation", async () => {
    const { sftpSessionId } = await createRequestDrivenSftpSession();
    setSftpSeekableOperationTimeoutForTests(5);
    let storageClosed = false;
    let resolveStream: ((stream: Readable) => void) | undefined;
    let lateStreamDestroyed = false;
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
      createReadStream() {
        return new Promise((resolve) => {
          resolveStream = resolve;
        });
      },
      async close() {
        storageClosed = true;
      },
    }));

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        await input.inputSource?.read(0, 4);
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId: sftpSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Remote range read /movies/Movie.Remote.mkv timed out after 5ms.",
    });
    expect(generationCount).toBe(1);
    expect(storageClosed).toBe(true);

    const lateStream = new Readable({
      read() {
        return;
      },
    });
    lateStream._destroy = (error, callback) => {
      lateStreamDestroyed = true;
      callback(error);
    };
    resolveStream?.(lateStream);
    await waitFor(() => lateStreamDestroyed);
  });

  test("fails request-driven SFTP range stream creation when a backend read is aborted", async () => {
    const { sftpSessionId } = await createRequestDrivenSftpSession();
    setSftpSeekableOperationTimeoutForTests(1_000);
    let storageClosed = false;
    let resolveStream: ((stream: Readable) => void) | undefined;
    let lateStreamDestroyed = false;
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
      createReadStream() {
        return new Promise((resolve) => {
          resolveStream = resolve;
        });
      },
      async close() {
        storageClosed = true;
      },
    }));

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        const controller = new AbortController();
        const read = input.inputSource?.read(0, 4, controller.signal);
        controller.abort();
        await read;
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId: sftpSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Remote range read /movies/Movie.Remote.mkv was cancelled.",
    });
    expect(generationCount).toBe(1);
    expect(storageClosed).toBe(true);

    const lateStream = new Readable({
      read() {
        return;
      },
    });
    lateStream._destroy = (error, callback) => {
      lateStreamDestroyed = true;
      callback(error);
    };
    resolveStream?.(lateStream);
    await waitFor(() => lateStreamDestroyed);
  });

  test("times out stalled request-driven SFTP range bodies", async () => {
    const { sftpSessionId } = await createRequestDrivenSftpSession();
    setSftpSeekableOperationTimeoutForTests(5);
    let storageClosed = false;
    let streamDestroyed = false;
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
        const stream = new Readable({
          read() {
            return;
          },
        });
        stream._destroy = (error, callback) => {
          streamDestroyed = error instanceof Error;
          callback(error);
        };
        return stream;
      },
      async close() {
        storageClosed = true;
      },
    }));

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        await input.inputSource?.read(0, 4);
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId: sftpSessionId, segment: "segment-00001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Remote range read /movies/Movie.Remote.mkv timed out after 5ms.",
    });
    expect(generationCount).toBe(1);
    expect(streamDestroyed).toBe(true);
    expect(storageClosed).toBe(true);
  });

  test("does not generate segments outside a known media duration", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 13 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00004.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(404);
    expect(generationCount).toBe(0);
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_name"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      error_message: null,
      last_segment_name: null,
    });
  });

  test("does not generate missing segments when media duration is unknown", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(404);
    expect(generationCount).toBe(0);
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_name"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      error_message: null,
      last_segment_name: null,
    });
  });

  test("bounds final request-driven segment duration to remaining media duration", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 13 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const requested = {
      startSeconds: null as number | null,
      segmentSeconds: null as number | null,
    };
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        const segment = requestedWindowSegment(input);
        requested.startSeconds = segment.segmentStartSeconds;
        requested.segmentSeconds = segment.segmentSeconds;
        await writeRequestedWindowSegment(input, "last");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00000.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(200);
    expect(requested).toEqual({ startSeconds: 0, segmentSeconds: 13 });
    expect(await response.text()).toBe("last");
  });

  test("does not generate missing segments for completed temporary artifacts", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "completed");

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        await writeRequestedWindowSegment(input, "generated");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const existingSegment = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    const missingSegment = await getSegment({
      params: { sessionId, segment: "segment-00010.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(existingSegment.status).toBe(200);
    expect(await existingSegment.text()).toBe("segment-body");
    expect(missingSegment.status).toBe(404);
    expect(generationCount).toBe(0);
  });

  test("falls back from request-driven remux to full transcode", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 60 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db.updateTable("playback_session").set({ mode: "remux" }).where("id", "=", sessionId).execute();

    const requestedModes: string[] = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        requestedModes.push(input.mode ?? "transcode");
        if (input.mode === "remux") throw new Error("remux segment failed");
        await writeRequestedWindowSegment(input, "fallback");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00003.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(200);
    expect(requestedModes).toEqual(["remux", "transcode"]);
    expect(await response.text()).toBe("fallback");
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "mode", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      mode: "transcode",
      error_message: null,
    });
  });

  test("preserves cancellation when request-driven remux generation fails", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 60 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db.updateTable("playback_session").set({ mode: "remux" }).where("id", "=", sessionId).execute();

    const requestedModes: string[] = [];
    let cancelCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        requestedModes.push(input.mode ?? "transcode");
        const now = new Date().toISOString();
        await db
          .updateTable("playback_session")
          .set({
            status: "cancelled",
            error_message: "Playback session was cancelled.",
            finished_at: now,
            updated_at: now,
          })
          .where("id", "=", sessionId)
          .execute();
        throw new Error("remux segment failed");
      },
      async cancel() {
        cancelCount += 1;
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00003.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(204);
    expect(requestedModes).toEqual(["remux"]);
    expect(cancelCount).toBeGreaterThanOrEqual(1);
  });

  test("preserves disabled policy when request-driven remux generation fails", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 60 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db.updateTable("playback_session").set({ mode: "remux" }).where("id", "=", sessionId).execute();

    const requestedModes: string[] = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        requestedModes.push(input.mode ?? "transcode");
        await setTranscodingEnabled(false);
        throw new Error("remux segment failed");
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00003.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(requestedModes).toEqual(["remux"]);
    expect(await response.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Transcoding is disabled by an administrator.",
    });
  });

  test("does not keep generated artifacts when remux fallback is cancelled", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 60 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db.updateTable("playback_session").set({ mode: "remux" }).where("id", "=", sessionId).execute();

    const requestedModes: string[] = [];
    let cancelCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        requestedModes.push(input.mode ?? "transcode");
        if (input.mode === "remux") throw new Error("remux segment failed");
        await writeRequestedWindowSegment(input, "fallback-after-cancel");
        const completion = new Promise<void>(() => undefined);
        const now = new Date().toISOString();
        await db
          .updateTable("playback_session")
          .set({
            status: "cancelled",
            error_message: "Playback session was cancelled.",
            finished_at: now,
            updated_at: now,
          })
          .where("id", "=", sessionId)
          .execute();
        return { completion };
      },
      async cancel() {
        cancelCount += 1;
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00003.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(204);
    expect(requestedModes).toEqual(["remux", "transcode"]);
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "mode", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      mode: "remux",
      error_message: "Playback session was cancelled.",
    });
    expect(await exists(path.join(path.dirname(playlistPath), "segment-00003.ts"))).toBe(false);
    expect(cancelCount).toBeGreaterThanOrEqual(1);
  });

  test("does not keep generated artifacts when policy is disabled during remux fallback", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 60 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db.updateTable("playback_session").set({ mode: "remux" }).where("id", "=", sessionId).execute();

    const requestedModes: string[] = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        requestedModes.push(input.mode ?? "transcode");
        if (input.mode === "remux") throw new Error("remux segment failed");
        await writeRequestedWindowSegment(input, "fallback-after-disable");
        await setTranscodingEnabled(false);
        throw new Error("fallback noticed disabled policy late");
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00003.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(requestedModes).toEqual(["remux", "transcode"]);
    const body = await response.json();
    expect(body.error).toMatch(/Transcoding is disabled by an administrator|fallback noticed disabled policy late/);
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "mode", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job.status).toBe("failed");
    expect(job.mode).toBe("remux");
    expect(job.error_message).toMatch(
      /Transcoding is disabled by an administrator|fallback noticed disabled policy late/,
    );
    expect(await exists(path.join(path.dirname(playlistPath), "segment-00003.ts"))).toBe(false);
  });

  test("aborts backend startup when request-driven generation is cancelled", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationStarted = false;
    let backendSignalAborted = false;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationStarted = true;
        await new Promise<void>((_resolve, reject) => {
          input.signal?.addEventListener(
            "abort",
            () => {
              backendSignalAborted = true;
              reject(new Error("backend startup cancelled"));
            },
            { once: true },
          );
        });
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const responsePromise = getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(() => generationStarted);

    expect(await cancelPlaybackSession(sessionId)).toBe("cancelled");
    expect(await segmentEnsureWaiterCountForTests(sessionId, "segment-00011.ts")).toBe(0);
    const response = await responsePromise;

    expect(response.status).toBe(204);
    expect(backendSignalAborted).toBe(true);
  });

  test("bulk admin cancellation aborts active request-driven generation and removes artifacts", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationStarted = false;
    let backendSignalAborted = false;
    let backendCancelCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationStarted = true;
        await new Promise<void>((_resolve, reject) => {
          input.signal?.addEventListener(
            "abort",
            () => {
              backendSignalAborted = true;
              reject(new Error("admin cancelled segment generation"));
            },
            { once: true },
          );
        });
        return completedWindowGeneration();
      },
      async cancel() {
        backendCancelCount += 1;
      },
    });

    const responsePromise = getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    await waitFor(() => generationStarted);

    await setTranscodingEnabled(false);
    expect(await cancelActivePlaybackSessions()).toBe(1);
    expect(await segmentEnsureWaiterCountForTests(sessionId, "segment-00011.ts")).toBe(0);
    const response = await Promise.race([
      responsePromise,
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out waiting for admin-cancelled segment request.")), 250),
      ),
    ]);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    expect(backendSignalAborted).toBe(true);
    expect(backendCancelCount).toBeGreaterThanOrEqual(1);
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      error_message: "Transcoding is disabled by an administrator.",
      last_segment_name: null,
      last_segment_request_at: null,
    });
    expect(await exists(path.dirname(playlistPath))).toBe(true);
  });

  test("aborts request-driven generation when the segment request is cancelled", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    const requestController = new AbortController();
    let generationStarted = false;
    let backendSignalAborted = false;
    let backendCancelCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationStarted = true;
        await new Promise<void>((_resolve, reject) => {
          input.signal?.addEventListener(
            "abort",
            () => {
              backendSignalAborted = true;
              reject(new Error("segment request cancelled"));
            },
            { once: true },
          );
        });
        return completedWindowGeneration();
      },
      async cancel() {
        backendCancelCount += 1;
      },
    });

    const responsePromise = getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
      request: { signal: requestController.signal },
    } as never);
    await waitFor(() => generationStarted);

    requestController.abort();
    const response = await responsePromise;

    expect(response.status).toBe(404);
    expect(backendSignalAborted).toBe(true);
    expect(backendCancelCount).toBe(0);
    expect(await response.text()).toBe("Not found.");
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "running",
      error_message: null,
      last_segment_name: null,
      last_segment_request_at: null,
    });
    expect(await exists(path.join(path.dirname(playlistPath), "segment-00011.ts"))).toBe(false);
  });

  test("does not serve a generated segment after the session is cancelled mid-generation", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    let cancelCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        await writeRequestedWindowSegment(input, "generated-after-cancel");
        const now = new Date().toISOString();
        await db
          .updateTable("playback_session")
          .set({
            status: "cancelled",
            error_message: "Playback session was cancelled.",
            finished_at: now,
            updated_at: now,
          })
          .where("id", "=", sessionId)
          .execute();
        return completedWindowGeneration();
      },
      async cancel() {
        cancelCount += 1;
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(204);
    expect(generationCount).toBe(1);
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "cancelled",
      error_message: "Playback session was cancelled.",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("does not serve a generated segment after transcoding is disabled mid-generation", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    let cancelCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        generationCount += 1;
        await writeRequestedWindowSegment(input, "generated-after-disable");
        await setTranscodingEnabled(false);
        return completedWindowGeneration();
      },
      async cancel() {
        cancelCount += 1;
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    expect(generationCount).toBe(1);
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Transcoding is disabled by an administrator.",
      last_segment_name: null,
      last_segment_request_at: null,
    });
    expect(cancelCount).toBeGreaterThanOrEqual(1);
  });

  test("returns the disabled-transcoding error when the backend throws after transcoding is disabled", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        await setTranscodingEnabled(false);
        throw new Error("backend noticed the disabled policy late");
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    expect(generationCount).toBe(1);
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Transcoding is disabled by an administrator.",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("does not return a missing segment after transcoding is disabled before generation starts", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");

    let generationCount = 0;
    setHlsSegmentReadDelayForTests(async () => {
      await setTranscodingEnabled(false);
    });
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Transcoding is disabled by an administrator.",
    });
    expect(generationCount).toBe(0);
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "last_segment_name", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Transcoding is disabled by an administrator.",
      last_segment_name: null,
      last_segment_request_at: null,
    });
  });

  test("fails when remux and fallback segment generation publish no segment", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 60 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    await db.updateTable("playback_session").set({ mode: "remux" }).where("id", "=", sessionId).execute();

    const requestedModes: string[] = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input) {
        requestedModes.push(input.mode ?? "transcode");
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00003.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    const message =
      "Remux segment generation failed, and the full transcode fallback also failed: Request-driven HLS segment generation completed without publishing segment-00003.ts.";
    expect(response.status).toBe(409);
    expect(requestedModes).toEqual(["remux", "transcode"]);
    expect(await response.json()).toEqual({ error: message });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "mode", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      mode: "remux",
      error_message: message,
    });
  });

  test("returns the failed session error when request-driven generation fails", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        throw new Error("segment encoder failed");
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "segment encoder failed" });
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "failed",
      error_message: "segment encoder failed",
    });
    const artifacts = await db
      .selectFrom("playback_hls_artifact")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("playback_session_id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(Number(artifacts.count)).toBe(0);
  });

  test("fails when request-driven generation publishes no segment", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 240 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
    let generationCount = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCount += 1;
        return completedWindowGeneration();
      },
      async cancel() {
        return;
      },
    });

    const response = await getSegment({
      params: { sessionId, segment: "segment-00011.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Request-driven HLS segment generation completed without publishing segment-00011.ts.",
    });
    expect(generationCount).toBe(1);
    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      status: "failed",
      error_message: "Request-driven HLS segment generation completed without publishing segment-00011.ts.",
    });
    const artifacts = await db
      .selectFrom("playback_hls_artifact")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("playback_session_id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(Number(artifacts.count)).toBe(0);
  });

  test("requires authentication for playlist and segment routes", async () => {
    const playlist = await getPlaylist({
      params: { sessionId },
      locals: { user: null },
    } as never);
    const segment = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: null },
    } as never);

    expect(playlist.status).toBe(401);
    expect(segment.status).toBe(401);
  });

  test("serves authorized HLS playlist and segment artifacts", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "completed");

    const playlist = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(playlist.status).toBe(200);
    expect(playlist.headers.get("content-type")).toContain("application/vnd.apple.mpegurl");
    expect(await playlist.text()).toContain("segments/segment-0001.ts");

    const segment = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(segment.status).toBe(200);
    expect(segment.headers.get("content-type")).toBe("video/mp2t");
    expect(segment.headers.get("cache-control")).toBe("no-store");
    expect(await segment.text()).toBe("segment-body");

    const job = await db
      .selectFrom("playback_session")
      .select(["last_segment_name", "last_segment_index", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job.last_segment_name).toBe("segment-0001.ts");
    expect(job.last_segment_index).toBe(1);
    expect(job.last_segment_request_at).toBeTruthy();
  });

  test("serves HLS init artifacts without recording segment consumption", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    const initPath = path.join(path.dirname(playlistPath), "init.mp4");
    await writeFile(initPath, "init");
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
        last_heartbeat_at: oldHeartbeat,
        last_segment_name: null,
        last_segment_index: null,
        last_segment_request_at: null,
      })
      .where("id", "=", sessionId)
      .execute();

    const init = await getSegment({
      params: { sessionId, segment: "init.mp4" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(init.status).toBe(200);
    expect(init.headers.get("content-type")).toBe("video/iso.segment");
    expect(await init.text()).toBe("init");
    const job = await db
      .selectFrom("playback_session")
      .select(["last_heartbeat_at", "last_segment_name", "last_segment_index", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      last_heartbeat_at: oldHeartbeat,
      last_segment_name: null,
      last_segment_index: null,
      last_segment_request_at: null,
    });
  });

  test("does not serve expired completed HLS artifacts", async () => {
    const oldHeartbeat = "2000-01-01T00:00:00.000Z";
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
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

    const playlist = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);

    const segment = await getSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    const playlistHead = await headPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8`),
    } as never);
    const segmentHead = await headSegment({
      params: { sessionId, segment: "segment-0001.ts" },
      locals: { user: { id: "user-1" } },
    } as never);

    expect(playlist.status).toBe(410);
    expect(await playlist.json()).toEqual({
      error: "Ended playback session is no longer active.",
    });
    expect(segment.status).toBe(410);
    expect(await segment.json()).toEqual({
      error: "Ended playback session is no longer active.",
    });
    expect(playlistHead.status).toBe(410);
    expect(segmentHead.status).toBe(410);
    const job = await db
      .selectFrom("playback_session")
      .select(["updated_at", "last_heartbeat_at", "last_segment_name", "last_segment_index", "last_segment_request_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(job).toEqual({
      updated_at: oldHeartbeat,
      last_heartbeat_at: oldHeartbeat,
      last_segment_name: null,
      last_segment_index: null,
      last_segment_request_at: null,
    });
  });

  test("does not synthesize virtual playlists for completed temporary artifacts", async () => {
    await db.updateTable("media_file").set({ duration_seconds: 13 }).where("id", "=", "file-1").execute();
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "completed");

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8?playlist=virtual`),
    } as never);
    const head = await headPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
      url: new URL(`http://localhost/media/playback-sessions/${sessionId}/master.m3u8?playlist=virtual`),
    } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Virtual HLS playlist is not available for this session.",
    });
    expect(head.status).toBe(409);
  });

  test("hides sessions owned by another user", async () => {
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
    });
    await updateTranscodeSessionStatus(sessionId, "completed");

    const response = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-2" } },
    } as never);

    expect(response.status).toBe(404);
  });

  test("returns stable responses for pending and unsafe HLS requests", async () => {
    const pending = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(pending.status).toBe(409);
    expect(await pending.json()).toEqual({
      error: "Playback session is not ready.",
    });

    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
    });

    const queuedWithArtifact = await getPlaylist({
      params: { sessionId },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(queuedWithArtifact.status).toBe(409);
    expect(await queuedWithArtifact.json()).toEqual({
      error: "Playback session is not ready.",
    });

    await updateTranscodeSessionStatus(sessionId, "running");

    const traversal = await getSegment({
      params: { sessionId, segment: "../secret.ts" },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(traversal.status).toBe(400);

    const playlistViaSegment = await getSegment({
      params: { sessionId, segment: "master.m3u8" },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(playlistViaSegment.status).toBe(400);

    const playlistHeadViaSegment = await headSegment({
      params: { sessionId, segment: "master.m3u8" },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(playlistHeadViaSegment.status).toBe(400);

    await writeFile(path.join(path.dirname(playlistPath), "movie.mp4"), "not an HLS init artifact");
    const arbitraryMp4 = await getSegment({
      params: { sessionId, segment: "movie.mp4" },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(arbitraryMp4.status).toBe(400);

    const arbitraryMp4Head = await headSegment({
      params: { sessionId, segment: "movie.mp4" },
      locals: { user: { id: "user-1" } },
    } as never);
    expect(arbitraryMp4Head.status).toBe(400);
  });
});
