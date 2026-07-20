import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests, type Database } from "$lib/server/db";
import { load as discoverLoad } from "./+page.server";

type DiscoverLoadResult = {
  movies: Array<{ id: string; title: string }>;
  moviesPage: { total: number };
  shows: Array<{ id: string; title: string }>;
  showsPage: { total: number };
};

const loadDiscover = discoverLoad as unknown as (event: {
  locals: { user: { id: string; role: string } };
}) => Promise<DiscoverLoadResult>;

describe("discover page server", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-discover-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Discover User",
        email: "discover@example.com",
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
        id: "library-movies",
        name: "Movies",
        kind: "movie",
        path: path.join(tempDir, "movies"),
        access_mode: "all",
        created_at: now,
        updated_at: now,
      })
      .execute();

    await db
      .insertInto("media_item")
      .values([
        {
          id: "movie-seed",
          kind: "movie",
          title: "Seed Movie",
          sort_title: "seed movie",
          year: 2020,
          overview: null,
          runtime_seconds: null,
          poster_path: "/seed.jpg",
          backdrop_path: null,
          release_date: "2020-01-01",
          provider: "tmdb",
          provider_id: "100",
          parent_id: null,
          popularity: 1,
          vote_average: 6,
          created_at: now,
          updated_at: now,
        },
        {
          id: "movie-match",
          kind: "movie",
          title: "Match Movie",
          sort_title: "match movie",
          year: 2021,
          overview: null,
          runtime_seconds: null,
          poster_path: "/match.jpg",
          backdrop_path: null,
          release_date: "2021-01-01",
          provider: "tmdb",
          provider_id: "200",
          parent_id: null,
          popularity: 2,
          vote_average: 7,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    await db
      .insertInto("media_file")
      .values([
        {
          id: "file-seed",
          library_id: "library-movies",
          media_item_id: "movie-seed",
          path: path.join(tempDir, "Seed Movie.mp4"),
          basename: "Seed Movie.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: 100,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
        {
          id: "file-match",
          library_id: "library-movies",
          media_item_id: "movie-match",
          path: path.join(tempDir, "Match Movie.mp4"),
          basename: "Match Movie.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: 100,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    await db
      .insertInto("media_item_keyword")
      .values([
        { media_item_id: "movie-seed", provider: "tmdb", provider_id: "k1", name: "spy" },
        { media_item_id: "movie-match", provider: "tmdb", provider_id: "k1", name: "spy" },
      ])
      .execute();

    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-seed",
        media_file_id: "file-seed",
        position_seconds: 100,
        duration_seconds: 100,
        completed: 1,
        updated_at: now,
      })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns movie picks based on watch history", async () => {
    const result = await loadDiscover({ locals: { user: { id: "user-1", role: "user" } } });

    expect(result.movies.map((movie) => movie.id)).toEqual(["movie-match"]);
    expect(result.movies.some((movie) => movie.id === "movie-seed")).toBe(false);
    expect(result.moviesPage.total).toBe(1);
    expect(result.shows).toEqual([]);
    expect(result.showsPage.total).toBe(0);
  });
});
