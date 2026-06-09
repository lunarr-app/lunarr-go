import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
} from ".";
import type { Database } from "./schema";
import { expectRejectsToThrow } from "$lib/test/async-expect";

describe("streaming schema", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-streaming-schema-"));

    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Streaming User",
        email: "streaming@example.com",
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
        size_bytes: 100,
        mtime_ms: nowMs,
        duration_seconds: null,
        video_codec: null,
        audio_codec: null,
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

  test("stores playback HLS artifacts and probed stream metadata for a media file", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("playback_session")
      .values({
        id: "session-1",
        media_file_id: "file-1",
        user_id: "user-1",
        status: "queued",
        mode: "transcode",
        error_message: null,
        started_at: null,
        finished_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("playback_hls_artifact")
      .values({
        id: "artifact-1",
        playback_session_id: "session-1",
        media_file_id: "file-1",
        path: path.join(
          tempDir,
          "playback-sessions",
          "session-1",
          "index.m3u8",
        ),
        mime_type: "application/vnd.apple.mpegurl",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_stream_info")
      .values([
        {
          id: "stream-video",
          media_file_id: "file-1",
          stream_index: 0,
          stream_type: "video",
          codec_name: "hevc",
          codec_long_name: "H.265 / HEVC",
          language: null,
          title: null,
          width: 3840,
          height: 2160,
          channels: null,
          sample_rate: null,
          duration_seconds: 7200,
          bit_rate: 12_000_000,
          raw_json: JSON.stringify({ index: 0, codec_type: "video" }),
          created_at: now,
          updated_at: now,
        },
        {
          id: "stream-audio",
          media_file_id: "file-1",
          stream_index: 1,
          stream_type: "audio",
          codec_name: "truehd",
          codec_long_name: "Dolby TrueHD",
          language: "en",
          title: "English",
          width: null,
          height: null,
          channels: 8,
          sample_rate: 48000,
          duration_seconds: 7200,
          bit_rate: 4_000_000,
          raw_json: JSON.stringify({ index: 1, codec_type: "audio" }),
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    await expectRejectsToThrow(
      db
        .insertInto("media_stream_info")
        .values({
          id: "stream-duplicate",
          media_file_id: "file-1",
          stream_index: 1,
          stream_type: "subtitle",
          codec_name: "subrip",
          codec_long_name: null,
          language: "en",
          title: null,
          width: null,
          height: null,
          channels: null,
          sample_rate: null,
          duration_seconds: null,
          bit_rate: null,
          raw_json: null,
          created_at: now,
          updated_at: now,
        })
        .execute(),
    );

    expect(
      await db.selectFrom("playback_session").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      await db.selectFrom("playback_hls_artifact").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      await db.selectFrom("media_stream_info").selectAll().execute(),
    ).toHaveLength(2);

    await db.deleteFrom("media_file").where("id", "=", "file-1").execute();
    expect(
      await db.selectFrom("playback_session").selectAll().execute(),
    ).toHaveLength(0);
    expect(
      await db.selectFrom("playback_hls_artifact").selectAll().execute(),
    ).toHaveLength(0);
    expect(
      await db.selectFrom("media_stream_info").selectAll().execute(),
    ).toHaveLength(0);
  });
});
