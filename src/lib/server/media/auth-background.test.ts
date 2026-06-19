import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { AUTH_BACKGROUND_GRID_SLOTS, AUTH_BACKGROUND_MIN_POSTERS, listAuthBackgroundPosters } from "./auth-background";

describe("auth background posters", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-auth-background-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    await db
      .insertInto("library")
      .values({
        id: "library-1",
        name: "Media",
        kind: "movie",
        path: tempDir,
        access_mode: "all",
        created_at: now,
        updated_at: now,
      })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns empty when library has too few posters", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values({
        id: "movie-1",
        kind: "movie",
        title: "One",
        sort_title: "one",
        year: 2024,
        poster_path: "/one.jpg",
        release_date: "2024-01-01",
        provider: null,
        provider_id: null,
        parent_id: null,
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
        path: path.join(tempDir, "one.mp4"),
        basename: "one.mp4",
        extension: ".mp4",
        size_bytes: 10,
        mtime_ms: Date.now(),
        duration_seconds: 100,
        video_codec: null,
        audio_codec: null,
        container: "mp4",
        created_at: now,
        updated_at: now,
      })
      .execute();

    expect(await listAuthBackgroundPosters()).toEqual([]);
  });

  test("builds a poster grid from movies and shows", async () => {
    const now = new Date().toISOString();
    const movies = Array.from({ length: AUTH_BACKGROUND_MIN_POSTERS }, (_, index) => ({
      id: `movie-${index + 1}`,
      kind: "movie" as const,
      title: `Movie ${index + 1}`,
      sort_title: `movie ${index + 1}`,
      year: 2024,
      poster_path: `/movie-${index + 1}.jpg`,
      release_date: "2024-01-01",
      provider: null,
      provider_id: null,
      parent_id: null,
      created_at: now,
      updated_at: now,
    }));

    await db.insertInto("media_item").values(movies).execute();
    await db
      .insertInto("media_file")
      .values(
        movies.map((movie, index) => ({
          id: `file-${index + 1}`,
          library_id: "library-1",
          media_item_id: movie.id,
          path: path.join(tempDir, `${movie.id}.mp4`),
          basename: `${movie.id}.mp4`,
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: Date.now(),
          duration_seconds: 100,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        })),
      )
      .execute();

    const posters = await listAuthBackgroundPosters();
    expect(posters).toHaveLength(AUTH_BACKGROUND_GRID_SLOTS);
    expect(posters[0]).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w154\//);
  });
});
