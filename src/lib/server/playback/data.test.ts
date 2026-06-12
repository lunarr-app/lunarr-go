import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests, type Database } from "$lib/server/db";
import { setTranscodeBackendForTests } from "$lib/server/transcoding/manager";
import type {
  HlsSegmentWindowGeneration,
  HlsSegmentWindowTranscodeInput,
  RunningTranscode
} from "$lib/server/transcoding/backend";
import { getPlaybackData } from ".";

async function completedWindowGeneration(
  input: HlsSegmentWindowTranscodeInput
): Promise<HlsSegmentWindowGeneration> {
  const segment = input.segments[0];
  if (!segment) throw new Error("Expected a requested HLS window segment.");
  await mkdir(input.artifactDirectory, { recursive: true });
  await writeFile(path.join(input.artifactDirectory, segment.segment), "generated");
  return { completion: Promise.resolve() };
}

type WatchLoadResult = {
  item: {
    id: string;
    kind: string;
    title: string;
    backHref: string;
  };
  startSeconds: number;
  playback: {
    mode: "direct" | "remux" | "transcode" | "unavailable";
    status: "ready" | "preparing" | "unavailable";
    playbackSessionId: string | null;
    streamUrl: string | null;
    streamStartSeconds: number;
    message: string | null;
    file: {
      id: string;
      media_item_id?: string;
      path?: string;
      library_id?: string;
      created_at?: string;
      updated_at?: string;
    };
    tracks: Array<{
      id: string;
      default: boolean;
      src: string;
    }>;
  };
};

describe("playback data", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-watch-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Watch User",
        email: "watch@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: nowMs,
        updated_at: nowMs
      })
      .execute();
    await db
      .insertInto("library")
      .values([
        {
          id: "library-1",
          name: "Movies",
          kind: "movie",
          path: tempDir,
          created_at: now,
          updated_at: now
        },
        {
          id: "library-tv",
          name: "Shows",
          kind: "tv",
          path: path.join(tempDir, "shows"),
          created_at: now,
          updated_at: now
        }
      ])
      .execute();
    await db
      .insertInto("media_item")
      .values([
        {
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
          updated_at: now
        },
        {
          id: "show-1",
          kind: "show",
          title: "The Expanse",
          sort_title: "expanse",
          year: 2015,
          provider: null,
          provider_id: null,
          parent_id: null,
          created_at: now,
          updated_at: now
        },
        {
          id: "season-1",
          kind: "season",
          title: "Season 1",
          sort_title: "0001",
          season_number: 1,
          provider: null,
          provider_id: null,
          parent_id: "show-1",
          created_at: now,
          updated_at: now
        },
        {
          id: "episode-1",
          kind: "episode",
          title: "Dulcinea",
          sort_title: "s001e0001",
          season_number: 1,
          episode_number: 1,
          provider: null,
          provider_id: null,
          parent_id: "season-1",
          created_at: now,
          updated_at: now
        }
      ])
      .execute();
    await db
      .insertInto("media_file")
      .values([
        {
          id: "file-a",
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
          updated_at: now
        },
        {
          id: "file-b",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "Movie.2026.4k.mp4"),
          basename: "Movie.2026.4k.mp4",
          extension: ".mp4",
          size_bytes: 20,
          mtime_ms: nowMs,
          duration_seconds: 300,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now
        },
        {
          id: "episode-file",
          library_id: "library-tv",
          media_item_id: "episode-1",
          path: path.join(tempDir, "shows", "The Expanse", "Season 01", "The Expanse - S01E01.mkv"),
          basename: "The Expanse - S01E01.mkv",
          extension: ".mkv",
          size_bytes: 20,
          mtime_ms: nowMs,
          duration_seconds: 300,
          video_codec: "h264",
          audio_codec: "aac",
          container: "mkv",
          created_at: now,
          updated_at: now
        }
      ])
      .execute();
    await mkdir(path.join(tempDir, "shows", "The Expanse", "Season 01"), { recursive: true });
    await writeFile(
      path.join(tempDir, "shows", "The Expanse", "Season 01", "The Expanse - S01E01.mkv"),
      "episode-source"
    );
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
          path: path.join(tempDir, "Movie.2026.vtt"),
          mime_type: "text/vtt",
          is_default: 1,
          created_at: now,
          updated_at: now
        },
        {
          id: "subtitle-file-b",
          media_item_id: "movie-1",
          media_file_id: "file-b",
          label: "File B",
          language: "en",
          source_kind: "external",
          path: path.join(tempDir, "Movie.2026.4k.en.vtt"),
          mime_type: "text/vtt",
          is_default: 0,
          created_at: now,
          updated_at: now
        },
        {
          id: "subtitle-file-a",
          media_item_id: "movie-1",
          media_file_id: "file-a",
          label: "File A",
          language: "en",
          source_kind: "external",
          path: path.join(tempDir, "Movie.2026.en.vtt"),
          mime_type: "text/vtt",
          is_default: 0,
          created_at: now,
          updated_at: now
        }
      ])
      .execute();
  });

  afterEach(async () => {
    setTranscodeBackendForTests(null);
    await closeDatabaseForTests?.();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("starts selected file playback at saved progress", async () => {
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-1",
        media_file_id: "file-b",
        position_seconds: 45.8,
        duration_seconds: 100,
        completed: 0,
        updated_at: new Date().toISOString()
      })
      .execute();

    const result = (await getPlaybackData({
      mediaItemId: "movie-1",
      userId: "user-1",
      url: new URL("http://localhost/movies/movie-1?play=movie-1&file=file-b")
    })) as WatchLoadResult;

    expect(result.startSeconds).toBe(45);
    expect(result.item).toMatchObject({ id: "movie-1", kind: "movie", title: "Movie", backHref: "/movies/movie-1" });
    expect(result.playback.file.id).toBe("file-b");
    expect(result.playback.file.media_item_id).toBeUndefined();
    expect(result.playback.file.path).toBeUndefined();
    expect(result.playback.file.library_id).toBeUndefined();
    expect(result.playback.file.created_at).toBeUndefined();
    expect(result.playback.file.updated_at).toBeUndefined();
    expect(result.playback.streamUrl).toBe("/media/files/file-b/stream");
    expect(result.playback.tracks).toMatchObject([
      {
        id: "subtitle-shared",
        default: true,
        src: "/media/subtitles/subtitle-shared"
      },
      {
        id: "subtitle-file-b",
        default: false,
        src: "/media/subtitles/subtitle-file-b"
      }
    ]);
  });

  test("starts completed progress from the beginning", async () => {
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-1",
        media_file_id: "file-a",
        position_seconds: 95,
        duration_seconds: 100,
        completed: 1,
        updated_at: new Date().toISOString()
      })
      .execute();

    const result = (await getPlaybackData({
      mediaItemId: "movie-1",
      userId: "user-1",
      url: new URL("http://localhost/movies/movie-1?play=movie-1&file=file-a")
    })) as WatchLoadResult;

    expect(result.startSeconds).toBe(0);
    expect(result.playback.file.id).toBe("file-a");
  });

  test("loads episode playback with show context", async () => {    setTranscodeBackendForTests({
      async startCompatibilityHls() {
        throw new Error("FFmpeg test backend unavailable.");
      },
      async cancel() {
        return;
      }
    });
    const result = (await getPlaybackData({
      mediaItemId: "episode-1",
      userId: "user-1",
      url: new URL("http://localhost/episodes/episode-1?play=episode-1&file=episode-file")
    })) as WatchLoadResult;

    expect(result.item).toMatchObject({
      id: "episode-1",
      kind: "episode",
      title: "The Expanse - S01E01 - Dulcinea",
      backHref: "/shows/show-1"
    });
    expect(result.playback.file.id).toBe("episode-file");
    expect(result.playback).toMatchObject({
      mode: "unavailable",
      status: "unavailable",
      streamUrl: null,
      message: "Request-driven HLS segment generation is not available."
    });
  });

  test("uses the latest unfinished progress file when no file is requested", async () => {
    await db
      .insertInto("watch_progress")
      .values([
        {
          user_id: "user-1",
          media_item_id: "movie-1",
          media_file_id: "file-a",
          position_seconds: 30,
          duration_seconds: 100,
          completed: 0,
          updated_at: "2026-01-01T00:00:00.000Z"
        },
        {
          user_id: "user-1",
          media_item_id: "movie-1",
          media_file_id: "file-b",
          position_seconds: 60,
          duration_seconds: 120,
          completed: 0,
          updated_at: "2026-01-02T00:00:00.000Z"
        }
      ])
      .execute();

    const result = (await getPlaybackData({
      mediaItemId: "movie-1",
      userId: "user-1",
      url: new URL("http://localhost/movies/movie-1?play=movie-1")
    })) as WatchLoadResult;

    expect(result.playback.file.id).toBe("file-b");
    expect(result.startSeconds).toBe(60);
  });

  test("falls back when saved progress points at an unshared file", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "library-private",
        name: "Private Movies",
        kind: "movie",
        access_mode: "shared",
        path: path.join(tempDir, "private"),
        created_at: now,
        updated_at: now
      })
      .execute();
    await db
      .updateTable("media_file")
      .set({ library_id: "library-private" })
      .where("id", "=", "file-b")
      .execute();
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-1",
        media_file_id: "file-b",
        position_seconds: 60,
        duration_seconds: 120,
        completed: 0,
        updated_at: "2026-01-02T00:00:00.000Z"
      })
      .execute();

    const result = (await getPlaybackData({
      mediaItemId: "movie-1",
      userId: "user-1",
      url: new URL("http://localhost/movies/movie-1?play=movie-1")
    })) as WatchLoadResult;

    expect(result.playback.file.id).toBe("file-a");
    expect(result.startSeconds).toBe(0);
  });

  test("uses explicit start query to reposition HLS playback", async () => {
    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        return {
          sessionId: input.sessionId,
          playlistPath: path.join(input.artifactDirectory, "master.m3u8"),
          completion: new Promise<void>(() => undefined),
          async cancel() {
            return;
          }
        };
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      }
    });

    const result = (await getPlaybackData({
      mediaItemId: "episode-1",
      userId: "user-1",
      url: new URL("http://localhost/episodes/episode-1?play=episode-1&file=episode-file&start=125.8")
    })) as WatchLoadResult;

    expect(result.startSeconds).toBe(125);
    expect(result.playback).toMatchObject({
      mode: "remux",
      status: "ready",
      modeDecision: {
        mode: "remux",
        reason: "container_unsupported"
      },
      streamStartSeconds: 0
    });
    expect(result.playback.playbackSessionId).toBeTruthy();
  });

  test("keeps explicit transcode query on the full transcode path", async () => {
    setTranscodeBackendForTests({
      async startCompatibilityHls(input): Promise<RunningTranscode> {
        return {
          sessionId: input.sessionId,
          playlistPath: path.join(input.artifactDirectory, "master.m3u8"),
          completion: new Promise<void>(() => undefined),
          async cancel() {
            return;
          }
        };
      },
      async generateHlsSegmentWindow(input) {
        return completedWindowGeneration(input);
      },
      async cancel() {
        return;
      }
    });

    const result = (await getPlaybackData({
      mediaItemId: "episode-1",
      userId: "user-1",
      url: new URL("http://localhost/episodes/episode-1?play=episode-1&file=episode-file&start=125.8&transcode=1")
    })) as WatchLoadResult;

    expect(result.startSeconds).toBe(125);
    expect(result.playback).toMatchObject({
      mode: "transcode",
      status: "ready",
      modeDecision: {
        mode: "remux",
        reason: "container_unsupported"
      },
      streamStartSeconds: 0
    });
    expect(result.playback.playbackSessionId).toBeTruthy();
  });
});
