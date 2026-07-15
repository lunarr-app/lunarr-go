import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { setTranscodingEnabled } from "$lib/server/transcoding/policy";
import { registerTranscodeHlsArtifact, setTranscodeTouchDelayForTests } from "$lib/server/transcoding/sessions";
import { verifySignedPlaybackToken } from "$lib/server/playback/signed-token";
import { GET as jobsGet } from "./jobs/+server";
import { GET as jobErrorsGet } from "./jobs/[id]/errors/+server";
import { GET as usersGet } from "./users/+server";
import { PATCH as updateUserPatch, DELETE as deleteUserDelete } from "./users/[id]/+server";
import { GET as playbackGet, POST as playbackPost } from "./playback/[id]/+server";
import { POST as cancelPlaybackSessionPost } from "./playback-sessions/[sessionId]/cancel/+server";
import { POST as heartbeatPlaybackSessionPost } from "./playback-sessions/[sessionId]/heartbeat/+server";
import { GET as streamGet, HEAD as streamHead } from "../media/files/[id]/stream/+server";
import { GET as subtitleGet, HEAD as subtitleHead } from "../media/subtitles/[id]/+server";

describe("authenticated API route boundaries", () => {
  test("rejects direct unauthenticated playback progress calls", async () => {
    const response = await playbackPost({
      params: { id: "movie-1" },
      request: new Request("http://localhost/api/playback/movie-1", {
        method: "POST",
        body: JSON.stringify({ mediaFileId: "file-1" }),
        headers: { "content-type": "application/json" },
      }),
      locals: { user: null },
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });

    const getResponse = await playbackGet({
      params: { id: "movie-1" },
      url: new URL("http://localhost/api/playback/movie-1"),
      locals: { user: null },
    } as never);

    expect(getResponse.status).toBe(401);
    expect(await getResponse.json()).toEqual({ error: "Unauthorized" });
  });

  test("saves playback progress for authenticated playback API calls", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-api-playback-"));

    try {
      await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
      await migrateDatabase();
      const db = await getDb();
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      await db
        .insertInto("user")
        .values({
          id: "user-1",
          name: "User",
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
          path: path.join(tempDir, "Movie.2026.mp4"),
          basename: "Movie.2026.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        })
        .execute();

      const response = await playbackPost({
        params: { id: "movie-1" },
        request: new Request("http://localhost/api/playback/movie-1", {
          method: "POST",
          body: JSON.stringify({
            mediaFileId: "file-1",
            positionSeconds: 45,
            durationSeconds: 100,
            completed: false,
          }),
          headers: { "content-type": "application/json" },
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });

      const progress = await db
        .selectFrom("watch_progress")
        .selectAll()
        .where("user_id", "=", "user-1")
        .where("media_item_id", "=", "movie-1")
        .where("media_file_id", "=", "file-1")
        .executeTakeFirstOrThrow();
      expect(progress).toMatchObject({
        position_seconds: 45,
        duration_seconds: 100,
        completed: 0,
      });
    } finally {
      await closeDatabaseForTests();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("returns a stable error for malformed playback progress JSON", async () => {
    const response = await playbackPost({
      params: { id: "movie-1" },
      request: new Request("http://localhost/api/playback/movie-1", {
        method: "POST",
        body: "{",
        headers: { "content-type": "application/json" },
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Request body must be valid JSON.",
    });
  });

  test("returns a stable error for invalid playback progress JSON shape", async () => {
    const response = await playbackPost({
      params: { id: "movie-1" },
      request: new Request("http://localhost/api/playback/movie-1", {
        method: "POST",
        body: JSON.stringify({
          mediaFileId: "file-1",
          positionSeconds: "45",
        }),
        headers: { "content-type": "application/json" },
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Position must be a finite number.",
    });
  });

  test("cancels an owned active playback session through the API", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-api-playback-session-cancel-"));

    try {
      await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
      await migrateDatabase();
      const db = await getDb();
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      await db
        .insertInto("user")
        .values({
          id: "user-1",
          name: "User",
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
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: "hevc",
          audio_codec: "dts",
          container: "matroska",
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto("playback_session")
        .values({
          id: "transcode-1",
          media_file_id: "file-1",
          user_id: "user-1",
          status: "running",
          mode: "transcode",
          error_message: null,
          started_at: now,
          finished_at: null,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const heartbeatResponse = await heartbeatPlaybackSessionPost({
        params: { sessionId: "transcode-1" },
        request: new Request("http://localhost/api/playback-sessions/transcode-1/heartbeat", {
          method: "POST",
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);

      expect(heartbeatResponse.status).toBe(204);
      const heartbeatedJob = await db
        .selectFrom("playback_session")
        .select("last_heartbeat_at")
        .where("id", "=", "transcode-1")
        .executeTakeFirstOrThrow();
      expect(heartbeatedJob.last_heartbeat_at).toBeTruthy();

      const oldHeartbeat = "2000-01-01T00:00:00.000Z";
      const abortController = new AbortController();
      await db
        .updateTable("playback_session")
        .set({ last_heartbeat_at: oldHeartbeat })
        .where("id", "=", "transcode-1")
        .execute();
      setTranscodeTouchDelayForTests(() => {
        abortController.abort();
      });

      const cancelledHeartbeatResponse = await heartbeatPlaybackSessionPost({
        params: { sessionId: "transcode-1" },
        request: new Request("http://localhost/api/playback-sessions/transcode-1/heartbeat", {
          method: "POST",
          signal: abortController.signal,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);

      expect(cancelledHeartbeatResponse.status).toBe(409);
      expect(await cancelledHeartbeatResponse.json()).toEqual({
        error: "Playback session is not active.",
      });
      const cancelledHeartbeatedJob = await db
        .selectFrom("playback_session")
        .select(["status", "last_heartbeat_at"])
        .where("id", "=", "transcode-1")
        .executeTakeFirstOrThrow();
      expect(cancelledHeartbeatedJob).toEqual({
        status: "running",
        last_heartbeat_at: oldHeartbeat,
      });
      setTranscodeTouchDelayForTests(null);

      await db
        .updateTable("playback_session")
        .set({ last_heartbeat_at: oldHeartbeat })
        .where("id", "=", "transcode-1")
        .execute();
      await setTranscodingEnabled(false);

      const disabledHeartbeatResponse = await heartbeatPlaybackSessionPost({
        params: { sessionId: "transcode-1" },
        request: new Request("http://localhost/api/playback-sessions/transcode-1/heartbeat", {
          method: "POST",
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);

      expect(disabledHeartbeatResponse.status).toBe(409);
      expect(await disabledHeartbeatResponse.json()).toEqual({
        error: "Transcoding is disabled by an administrator.",
      });
      const disabledHeartbeatedJob = await db
        .selectFrom("playback_session")
        .select(["status", "error_message", "last_heartbeat_at"])
        .where("id", "=", "transcode-1")
        .executeTakeFirstOrThrow();
      expect(disabledHeartbeatedJob).toEqual({
        status: "cancelled",
        error_message: "Transcoding is disabled by an administrator.",
        last_heartbeat_at: oldHeartbeat,
      });

      await setTranscodingEnabled(true);
      await db
        .insertInto("playback_session")
        .values({
          id: "transcode-2",
          media_file_id: "file-1",
          user_id: "user-1",
          status: "running",
          mode: "transcode",
          error_message: null,
          started_at: now,
          finished_at: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      const playbackArtifactDir = path.join(tempDir, "playback-sessions", "transcode-2");
      const playbackPlaylistPath = path.join(playbackArtifactDir, "master.m3u8");
      await mkdir(playbackArtifactDir, { recursive: true });
      await writeFile(playbackPlaylistPath, "#EXTM3U\n");
      await writeFile(path.join(playbackArtifactDir, "segment-00001.ts"), "segment");
      await registerTranscodeHlsArtifact({
        sessionId: "transcode-2",
        mediaFileId: "file-1",
        path: playbackPlaylistPath,
        mimeType: "application/vnd.apple.mpegurl",
      });

      const response = await cancelPlaybackSessionPost({
        params: { sessionId: "transcode-2" },
        request: new Request("http://localhost/api/playback-sessions/transcode-2/cancel", {
          method: "POST",
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      const duplicateResponse = await cancelPlaybackSessionPost({
        params: { sessionId: "transcode-2" },
        request: new Request("http://localhost/api/playback-sessions/transcode-2/cancel", {
          method: "POST",
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);
      expect(duplicateResponse.status).toBe(400);
      expect(((await duplicateResponse.json()) as { error: string }).error).toBe("Playback session is not active.");

      const job = await db
        .selectFrom("playback_session")
        .select(["status", "error_message"])
        .where("id", "=", "transcode-2")
        .executeTakeFirstOrThrow();
      expect(job).toEqual({
        status: "cancelled",
        error_message: "Playback session was cancelled.",
      });
      expect(
        await stat(playbackArtifactDir).then(
          () => true,
          () => false,
        ),
      ).toBe(true);
      const artifact = await db
        .selectFrom("playback_hls_artifact")
        .select("id")
        .where("playback_session_id", "=", "transcode-2")
        .executeTakeFirst();
      expect(artifact).toBeDefined();
    } finally {
      setTranscodeTouchDelayForTests(null);
      await closeDatabaseForTests();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("returns signed playback URLs for direct, HLS, and subtitles", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-api-cast-playback-"));

    try {
      await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
      await migrateDatabase();
      const db = await getDb();
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const filePath = path.join(tempDir, "Movie.2026.mp4");
      await writeFile(filePath, "0123456789");
      await db
        .insertInto("user")
        .values({
          id: "user-1",
          name: "User",
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
          access_mode: "all",
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
          path: filePath,
          basename: "Movie.2026.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: 120,
          video_codec: "h264",
          audio_codec: "aac",
          container: "mp4",
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto("subtitle_track")
        .values({
          id: "subtitle-1",
          media_item_id: "movie-1",
          media_file_id: "file-1",
          label: "English",
          language: "en",
          source_kind: "external",
          path: path.join(tempDir, "Movie.2026.en.vtt"),
          mime_type: "text/vtt",
          is_default: 1,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const directResponse = await playbackGet({
        params: { id: "movie-1" },
        url: new URL("http://localhost/api/playback/movie-1?file=file-1"),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);

      expect(directResponse.status).toBe(200);
      const directBody = await directResponse.json();
      expect(directBody).toMatchObject({
        item: { title: "Movie" },
        playback: {
          mode: "direct",
          status: "ready",
          file: { id: "file-1", duration_seconds: 120 },
          playbackSessionId: null,
          tracks: [
            {
              id: "subtitle-1",
              label: "English",
              language: "en",
              default: true,
            },
          ],
        },
      });
      const directStreamUrl = new URL(directBody.playback.streamUrl);
      expect(directStreamUrl.origin).toBe("http://localhost");
      expect(directStreamUrl.pathname).toBe("/media/files/file-1/stream");
      expect(
        verifySignedPlaybackToken(directStreamUrl.searchParams.get("remoteToken"), {
          route: "direct",
          mediaFileId: "file-1",
        }),
      ).toMatchObject({
        route: "direct",
        userId: "user-1",
        mediaFileId: "file-1",
      });
      const subtitleUrl = new URL(directBody.playback.tracks[0].src);
      expect(subtitleUrl.origin).toBe("http://localhost");
      expect(subtitleUrl.pathname).toBe("/media/subtitles/subtitle-1");
      expect(
        verifySignedPlaybackToken(subtitleUrl.searchParams.get("remoteToken"), {
          route: "subtitle",
          subtitleTrackId: "subtitle-1",
        }),
      ).toMatchObject({
        route: "subtitle",
        userId: "user-1",
        mediaFileId: "file-1",
        subtitleTrackId: "subtitle-1",
      });

      const alternateOriginResponse = await playbackGet({
        params: { id: "movie-1" },
        url: new URL("http://iphone.local/api/playback/movie-1?file=file-1"),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);

      expect(alternateOriginResponse.status).toBe(200);
      const alternateOriginBody = await alternateOriginResponse.json();
      const alternateOriginStreamUrl = new URL(alternateOriginBody.playback.streamUrl);
      expect(alternateOriginStreamUrl.origin).toBe("http://iphone.local");
      expect(alternateOriginStreamUrl.pathname).toBe("/media/files/file-1/stream");
      const alternateOriginSubtitleUrl = new URL(alternateOriginBody.playback.tracks[0].src);
      expect(alternateOriginSubtitleUrl.origin).toBe("http://iphone.local");
      expect(alternateOriginSubtitleUrl.pathname).toBe("/media/subtitles/subtitle-1");

      await db
        .insertInto("playback_session")
        .values({
          id: "transcode-1",
          media_file_id: "file-1",
          user_id: "user-1",
          status: "running",
          mode: "transcode",
          error_message: null,
          started_at: now,
          finished_at: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      const playbackArtifactDir = path.join(tempDir, "playback-sessions", "transcode-1");
      const playbackPlaylistPath = path.join(playbackArtifactDir, "master.m3u8");
      await mkdir(playbackArtifactDir, { recursive: true });
      await writeFile(playbackPlaylistPath, "#EXTM3U\n");
      await registerTranscodeHlsArtifact({
        sessionId: "transcode-1",
        mediaFileId: "file-1",
        path: playbackPlaylistPath,
        mimeType: "application/vnd.apple.mpegurl",
      });

      const hlsResponse = await playbackGet({
        params: { id: "movie-1" },
        url: new URL("http://localhost/api/playback/movie-1?file=file-1&transcode=true"),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);

      expect(hlsResponse.status).toBe(200);
      const hlsBody = await hlsResponse.json();
      expect(hlsBody.playback).toMatchObject({
        mode: "transcode",
        status: "ready",
        playbackSessionId: "transcode-1",
      });
      const hlsStreamUrl = new URL(hlsBody.playback.streamUrl);
      expect(hlsStreamUrl.pathname).toBe("/media/playback-sessions/transcode-1/master.m3u8");
      expect(
        verifySignedPlaybackToken(hlsStreamUrl.searchParams.get("remoteToken"), {
          route: "hls",
          playbackSessionId: "transcode-1",
        }),
      ).toMatchObject({
        route: "hls",
        userId: "user-1",
        mediaFileId: "file-1",
        playbackSessionId: "transcode-1",
      });
    } finally {
      await closeDatabaseForTests();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("returns signed direct playback URLs for native clients", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-api-native-playback-"));

    try {
      await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
      await migrateDatabase();
      const db = await getDb();
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const filePath = path.join(tempDir, "Movie.2026.mkv");
      await writeFile(filePath, "0123456789");
      await db
        .insertInto("user")
        .values({
          id: "user-1",
          name: "User",
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
          access_mode: "all",
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
          id: "file-mkv",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: filePath,
          basename: "Movie.2026.mkv",
          extension: ".mkv",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: 120,
          video_codec: "hevc",
          audio_codec: "dts",
          container: "matroska",
          created_at: now,
          updated_at: now,
        })
        .execute();

      const nativeResponse = await playbackGet({
        params: { id: "movie-1" },
        url: new URL("http://localhost/api/playback/movie-1?file=file-mkv&target=native"),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);

      expect(nativeResponse.status).toBe(200);
      const nativeBody = await nativeResponse.json();
      expect(nativeBody.playback).toMatchObject({
        mode: "direct",
        status: "ready",
        target: "native",
        file: { id: "file-mkv", extension: ".mkv" },
        playbackSessionId: null,
      });
      const nativeStreamUrl = new URL(nativeBody.playback.streamUrl);
      expect(nativeStreamUrl.pathname).toBe("/media/files/file-mkv/stream");
      expect(
        verifySignedPlaybackToken(nativeStreamUrl.searchParams.get("remoteToken"), {
          route: "direct",
          mediaFileId: "file-mkv",
        }),
      ).toMatchObject({
        route: "direct",
        userId: "user-1",
        mediaFileId: "file-mkv",
      });

      const webResponse = await playbackGet({
        params: { id: "movie-1" },
        url: new URL("http://localhost/api/playback/movie-1?file=file-mkv"),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);

      expect(webResponse.status).toBe(200);
      const webBody = await webResponse.json();
      expect(webBody.playback.target).toBe("web");
      expect(webBody.playback.mode).not.toBe("direct");
    } finally {
      await closeDatabaseForTests();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("rejects direct unauthenticated stream calls", async () => {
    const request = new Request("http://localhost/media/files/file-1/stream");
    const getResponse = await streamGet({
      params: { id: "file-1" },
      request,
      locals: { user: null },
    } as never);
    const headResponse = await streamHead({
      params: { id: "file-1" },
      request,
      locals: { user: null },
    } as never);

    expect(getResponse.status).toBe(401);
    expect(await getResponse.json()).toEqual({ error: "Unauthorized" });
    expect(headResponse.status).toBe(401);
  });

  test("serves authenticated media stream byte ranges through the stream route", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-api-stream-"));

    try {
      await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
      await migrateDatabase();
      const db = await getDb();
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const filePath = path.join(tempDir, "Movie.2026.mp4");
      await writeFile(filePath, "0123456789");
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
          path: filePath,
          basename: "Movie.2026.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        })
        .execute();

      const request = new Request("http://localhost/media/files/file-1/stream", {
        headers: { range: "bytes=2-5" },
      });
      const response = await streamGet({
        params: { id: "file-1" },
        request,
        locals: { user: { id: "user-1", role: "user" } },
      } as never);

      expect(response.status).toBe(206);
      expect(response.headers.get("content-type")).toBe("video/mp4");
      expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
      expect(response.headers.get("accept-ranges")).toBe("bytes");
      expect(await response.text()).toBe("2345");

      const headResponse = await streamHead({
        params: { id: "file-1" },
        request: new Request("http://localhost/media/files/file-1/stream", {
          headers: { range: "bytes=2-5" },
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);
      expect(headResponse.status).toBe(206);
      expect(headResponse.headers.get("content-type")).toBe("video/mp4");
      expect(headResponse.headers.get("content-range")).toBe("bytes 2-5/10");
      expect(headResponse.body).toBeNull();
    } finally {
      await closeDatabaseForTests();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("rejects direct unauthenticated subtitle calls", async () => {
    const getResponse = await subtitleGet({
      params: { id: "subtitle-1" },
      locals: { user: null },
    } as never);
    const headResponse = await subtitleHead({
      params: { id: "subtitle-1" },
      locals: { user: null },
    } as never);

    expect(getResponse.status).toBe(401);
    expect(await getResponse.json()).toEqual({ error: "Unauthorized" });
    expect(headResponse.status).toBe(401);
  });

  test("serves authenticated external movie subtitle tracks through the subtitle route", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-api-subtitle-"));

    try {
      await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
      await migrateDatabase();
      const db = await getDb();
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const subtitlePath = path.join(tempDir, "Movie.2026.en.vtt");
      await writeFile(subtitlePath, "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n");
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
          path: path.join(tempDir, "Movie.2026.mp4"),
          basename: "Movie.2026.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto("subtitle_track")
        .values({
          id: "subtitle-1",
          media_item_id: "movie-1",
          media_file_id: "file-1",
          label: "English",
          language: "en",
          source_kind: "external",
          path: subtitlePath,
          mime_type: "text/vtt",
          is_default: 1,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const response = await subtitleGet({
        params: { id: "subtitle-1" },
        locals: { user: { id: "user-1", role: "user" } },
      } as never);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/vtt");
      expect(response.headers.get("content-length")).toBe("44");
      expect(await response.text()).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n");

      const headResponse = await subtitleHead({
        params: { id: "subtitle-1" },
        locals: { user: { id: "user-1", role: "user" } },
      } as never);
      expect(headResponse.status).toBe(200);
      expect(headResponse.headers.get("content-type")).toBe("text/vtt");
      expect(headResponse.headers.get("content-length")).toBe("44");
      expect(headResponse.body).toBeNull();
    } finally {
      await closeDatabaseForTests();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("distinguishes unauthenticated and non-admin jobs API calls", async () => {
    const unauthenticated = await jobsGet({
      locals: { user: null },
    } as never);
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toEqual({ error: "Unauthorized" });

    const nonAdmin = await jobsGet({
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(nonAdmin.status).toBe(403);
    expect(await nonAdmin.json()).toEqual({ error: "Admin access required" });
  });

  test("distinguishes unauthenticated and non-admin users API calls", async () => {
    const unauthenticated = await usersGet({
      locals: { user: null },
    } as never);
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toEqual({ error: "Unauthorized" });

    const nonAdmin = await usersGet({
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(nonAdmin.status).toBe(403);
    expect(await nonAdmin.json()).toEqual({ error: "Admin access required" });

    const patchRequest = new Request("http://localhost/api/users/user-2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    const forbiddenPatch = await updateUserPatch({
      params: { id: "user-2" },
      request: patchRequest,
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(forbiddenPatch.status).toBe(403);
    expect(await forbiddenPatch.json()).toEqual({ error: "Admin access required" });

    const forbiddenDelete = await deleteUserDelete({
      params: { id: "user-2" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(forbiddenDelete.status).toBe(403);
    expect(await forbiddenDelete.json()).toEqual({ error: "Admin access required" });
  });

  test("returns scan jobs and playback sessions for admin jobs API calls", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-api-jobs-"));

    try {
      await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
      await migrateDatabase();
      const db = await getDb();
      const now = new Date().toISOString();
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
        .insertInto("user")
        .values({
          id: "playback-user",
          name: "Playback User",
          email: "playback@example.com",
          role: "user",
          email_verified: 0,
          image: null,
          created_at: Date.now(),
          updated_at: Date.now(),
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
          mtime_ms: Date.now(),
          duration_seconds: 120,
          video_codec: "hevc",
          audio_codec: "dts",
          container: "matroska",
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto("scan_job")
        .values([
          {
            id: "completed-job",
            library_id: "library-1",
            status: "completed",
            started_at: now,
            finished_at: now,
            files_seen: 1,
            files_added: 1,
            files_updated: 0,
            errors_count: 1,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "running-job",
            library_id: "library-1",
            status: "running",
            started_at: now,
            finished_at: null,
            files_seen: 2,
            files_added: 0,
            files_updated: 1,
            errors_count: 0,
            created_at: "2026-01-02T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z",
          },
        ])
        .execute();
      await db
        .insertInto("scan_job_error")
        .values({
          scan_job_id: "completed-job",
          path: path.join(tempDir, "Broken.Movie.2026.mkv"),
          message: "Could not read file.",
          created_at: now,
        })
        .execute();
      await db
        .insertInto("playback_session")
        .values([
          {
            id: "running-playback",
            media_file_id: "file-1",
            user_id: "playback-user",
            status: "running",
            mode: "transcode",
            pipeline: "request_driven",
            error_message: null,
            last_heartbeat_at: now,
            last_segment_request_at: now,
            last_segment_name: "segment-00003.ts",
            last_segment_index: 3,
            start_time_seconds: 12,
            started_at: now,
            finished_at: null,
            created_at: "2026-01-03T00:00:00.000Z",
            updated_at: "2026-01-03T00:00:00.000Z",
          },
          {
            id: "failed-playback",
            media_file_id: "file-1",
            user_id: "playback-user",
            status: "failed",
            mode: "transcode",
            pipeline: "request_driven",
            error_message: "Playback session was cancelled.",
            last_heartbeat_at: null,
            last_segment_request_at: null,
            last_segment_name: null,
            last_segment_index: null,
            start_time_seconds: 0,
            started_at: now,
            finished_at: now,
            created_at: "2026-01-04T00:00:00.000Z",
            updated_at: "2026-01-04T00:00:00.000Z",
          },
        ])
        .execute();

      const response = await jobsGet({
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.summary).toEqual({
        total: 2,
        active: 1,
        completed: 1,
        failed: 0,
        cancelled: 0,
        errors: 1,
      });
      expect(body.playbackSessionSummary).toEqual({
        total: 2,
        active: 1,
        completed: 0,
        failed: 1,
        cancelled: 0,
        errors: 1,
      });
      expect(body.playbackSessions[0]).toMatchObject({
        playback_session_id: "failed-playback",
        status: "failed",
        pipeline: "request_driven",
        error_message: "Playback session was cancelled.",
      });
      expect(body.playbackSessions[0]).not.toHaveProperty("id");
      expect(body.playbackSessions[0]).not.toHaveProperty("output_path");
      expect(body.playbackSessions[1]).toMatchObject({
        playback_session_id: "running-playback",
        media_file_id: "file-1",
        status: "running",
        pipeline: "request_driven",
        start_time_seconds: 12,
        media_title: "Movie",
        file_basename: "Movie.2026.mkv",
        user_email: "playback@example.com",
      });
      expect(body.playbackSessions[1]).not.toHaveProperty("id");
      expect(body.playbackSessions[1]).not.toHaveProperty("output_path");
      expect(body.jobs[0]).toMatchObject({
        id: "running-job",
        library_name: "Movies",
        status: "running",
      });
      expect(body).not.toHaveProperty("errors");

      const errorsResponse = await jobErrorsGet({
        params: { id: "completed-job" },
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never);
      const errorsBody = await errorsResponse.json();

      expect(errorsResponse.status).toBe(200);
      expect(errorsBody.limit).toBe(100);
      expect(errorsBody.errors[0]).toMatchObject({
        scan_job_id: "completed-job",
        library_name: "Movies",
        message: "Could not read file.",
      });
    } finally {
      await closeDatabaseForTests();
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
