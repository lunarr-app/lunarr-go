import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { externalMovieSubtitleResponse, getExternalMovieSubtitleTrack } from "./subtitles";

describe("getExternalMovieSubtitleTrack", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-subtitles-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
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
          id: "movie-file",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "Movie.mp4"),
          basename: "Movie.mp4",
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
          id: "show-file",
          library_id: "library-1",
          media_item_id: "show-1",
          path: path.join(tempDir, "Show.mp4"),
          basename: "Show.mp4",
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
      ])
      .execute();
    await db
      .insertInto("subtitle_track")
      .values([
        {
          id: "movie-subtitle",
          media_item_id: "movie-1",
          media_file_id: "movie-file",
          label: "English",
          language: "en",
          source_kind: "external",
          path: path.join(tempDir, "Movie.en.vtt"),
          mime_type: "text/vtt",
          is_default: 1,
          created_at: now,
          updated_at: now,
        },
        {
          id: "show-subtitle",
          media_item_id: "show-1",
          media_file_id: "show-file",
          label: "English",
          language: "en",
          source_kind: "external",
          path: path.join(tempDir, "Show.en.vtt"),
          mime_type: "text/vtt",
          is_default: 1,
          created_at: now,
          updated_at: now,
        },
        {
          id: "embedded-subtitle",
          media_item_id: "movie-1",
          media_file_id: "movie-file",
          label: "Embedded",
          language: "en",
          source_kind: "embedded",
          path: null,
          mime_type: null,
          is_default: 0,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    await writeFile(path.join(tempDir, "Movie.en.vtt"), "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n");
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns only external subtitle tracks for movie items", async () => {
    expect(await getExternalMovieSubtitleTrack("movie-subtitle", "user-1")).toMatchObject({
      label: "English",
      mime_type: "text/vtt",
    });
    expect(await getExternalMovieSubtitleTrack("show-subtitle", "user-1")).toBeUndefined();
    expect(await getExternalMovieSubtitleTrack("embedded-subtitle", "user-1")).toBeUndefined();
  });

  test("serves external movie subtitle bodies and HEAD metadata", async () => {
    const response = await externalMovieSubtitleResponse("movie-subtitle", "user-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/vtt");
    expect(response.headers.get("content-length")).toBe("44");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="English"');
    expect(await response.text()).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n");

    const headResponse = await externalMovieSubtitleResponse("movie-subtitle", "user-1", false);
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("content-type")).toBe("text/vtt");
    expect(headResponse.headers.get("content-length")).toBe("44");
    expect(headResponse.body).toBeNull();
  });

  test("returns not found for missing subtitle files", async () => {
    const response = await externalMovieSubtitleResponse("missing-subtitle", "user-1");
    expect(response.status).toBe(404);

    await rm(path.join(tempDir, "Movie.en.vtt"));
    const staleResponse = await externalMovieSubtitleResponse("movie-subtitle", "user-1", false);
    expect(staleResponse.status).toBe(404);
    expect(staleResponse.body).toBeNull();
  });

  test("returns not found for subtitle paths that are not regular files", async () => {
    await rm(path.join(tempDir, "Movie.en.vtt"));
    await mkdir(path.join(tempDir, "Movie.en.vtt"));

    const response = await externalMovieSubtitleResponse("movie-subtitle", "user-1");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Subtitle file is no longer available");

    const headResponse = await externalMovieSubtitleResponse("movie-subtitle", "user-1", false);
    expect(headResponse.status).toBe(404);
    expect(headResponse.body).toBeNull();
  });
});
