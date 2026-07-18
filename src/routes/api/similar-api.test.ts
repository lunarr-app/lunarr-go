import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { GET as similarMoviesGet } from "./movies/[id]/similar/+server";
import { GET as similarShowsGet } from "./shows/[id]/similar/+server";

describe("similar catalog API", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  test("returns ranked similar movies with pagination metadata", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-similar-api-"));
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
          id: "movie-1",
          kind: "movie",
          title: "Seed",
          sort_title: "seed",
          year: 2020,
          provider: "tmdb",
          provider_id: "movie-1",
          parent_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "movie-2",
          kind: "movie",
          title: "Strong match",
          sort_title: "strong match",
          year: 2021,
          popularity: 100,
          provider: "tmdb",
          provider_id: "movie-2",
          parent_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "movie-3",
          kind: "movie",
          title: "Weak match",
          sort_title: "weak match",
          year: 2019,
          popularity: 200,
          provider: "tmdb",
          provider_id: "movie-3",
          parent_id: null,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("media_file")
      .values([
        {
          id: "file-1",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "Seed.mp4"),
          basename: "Seed.mp4",
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
          id: "file-2",
          library_id: "library-1",
          media_item_id: "movie-2",
          path: path.join(tempDir, "Strong.mp4"),
          basename: "Strong.mp4",
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
          id: "file-3",
          library_id: "library-1",
          media_item_id: "movie-3",
          path: path.join(tempDir, "Weak.mp4"),
          basename: "Weak.mp4",
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
      .insertInto("media_item_genre")
      .values([
        { media_item_id: "movie-1", provider: "tmdb", provider_id: "g1", name: "Action", position: 0 },
        { media_item_id: "movie-2", provider: "tmdb", provider_id: "g1", name: "Action", position: 0 },
      ])
      .execute();
    await db
      .insertInto("media_item_keyword")
      .values([
        { media_item_id: "movie-1", provider: "tmdb", provider_id: "k1", name: "spy" },
        { media_item_id: "movie-2", provider: "tmdb", provider_id: "k1", name: "spy" },
      ])
      .execute();
    await db
      .insertInto("media_item_credit")
      .values([
        {
          media_item_id: "movie-1",
          credit_type: "cast",
          provider: "tmdb",
          provider_id: "p1",
          credit_id: "c1",
          name: "Actor One",
          original_name: "Actor One",
          profile_path: null,
          credit_order: 0,
          department: null,
          job: null,
          character_name: null,
        },
        {
          media_item_id: "movie-2",
          credit_type: "cast",
          provider: "tmdb",
          provider_id: "p1",
          credit_id: "c2",
          name: "Actor One",
          original_name: "Actor One",
          profile_path: null,
          credit_order: 0,
          department: null,
          job: null,
          character_name: null,
        },
        {
          media_item_id: "movie-3",
          credit_type: "cast",
          provider: "tmdb",
          provider_id: "p1",
          credit_id: "c3",
          name: "Actor One",
          original_name: "Actor One",
          profile_path: null,
          credit_order: 0,
          department: null,
          job: null,
          character_name: null,
        },
      ])
      .execute();

    const response = await similarMoviesGet({
      params: { id: "movie-1" },
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/movies/movie-1/similar"),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      movie: { id: "movie-1", title: "Seed" },
      movies: [{ id: "movie-2" }, { id: "movie-3" }],
      page: {
        page: 1,
        pageSize: 24,
        total: 2,
        hasPrevious: false,
        hasNext: false,
      },
    });

    const limited = await similarMoviesGet({
      params: { id: "movie-1" },
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/movies/movie-1/similar?limit=1"),
    } as never);

    expect(limited.status).toBe(200);
    expect(await limited.json()).toMatchObject({
      movies: [{ id: "movie-2" }],
      page: {
        page: 1,
        pageSize: 1,
        total: 2,
        totalPages: 2,
        hasNext: true,
      },
    });
  });

  test("returns 404 when the source movie is inaccessible", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-similar-api-missing-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();

    const response = await similarMoviesGet({
      params: { id: "missing-movie" },
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/movies/missing-movie/similar"),
    } as never);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ detail: "Movie not found." });
  });

  test("returns ranked similar shows with pagination metadata", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-similar-shows-api-"));
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
        id: "library-tv",
        name: "TV",
        kind: "tv",
        path: path.join(tempDir, "tv"),
        access_mode: "all",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "show-1",
          kind: "show",
          title: "Seed Show",
          sort_title: "seed show",
          year: 2020,
          provider: "tmdb",
          provider_id: "s1",
          parent_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "show-2",
          kind: "show",
          title: "Strong Show",
          sort_title: "strong show",
          year: 2021,
          popularity: 10,
          provider: "tmdb",
          provider_id: "s2",
          parent_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "show-3",
          kind: "show",
          title: "Weak Show",
          sort_title: "weak show",
          year: 2019,
          popularity: 100,
          provider: "tmdb",
          provider_id: "s3",
          parent_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "season-1",
          kind: "season",
          title: "Season 1",
          sort_title: "0001",
          season_number: 1,
          provider: "tmdb",
          provider_id: "ss1",
          parent_id: "show-1",
          created_at: now,
          updated_at: now,
        },
        {
          id: "season-2",
          kind: "season",
          title: "Season 1",
          sort_title: "0001",
          season_number: 1,
          provider: "tmdb",
          provider_id: "ss2",
          parent_id: "show-2",
          created_at: now,
          updated_at: now,
        },
        {
          id: "season-3",
          kind: "season",
          title: "Season 1",
          sort_title: "0001",
          season_number: 1,
          provider: "tmdb",
          provider_id: "ss3",
          parent_id: "show-3",
          created_at: now,
          updated_at: now,
        },
        {
          id: "ep-1",
          kind: "episode",
          title: "Ep",
          sort_title: "s01e01",
          season_number: 1,
          episode_number: 1,
          provider: "tmdb",
          provider_id: "e1",
          parent_id: "season-1",
          created_at: now,
          updated_at: now,
        },
        {
          id: "ep-2",
          kind: "episode",
          title: "Ep",
          sort_title: "s01e01",
          season_number: 1,
          episode_number: 1,
          provider: "tmdb",
          provider_id: "e2",
          parent_id: "season-2",
          created_at: now,
          updated_at: now,
        },
        {
          id: "ep-3",
          kind: "episode",
          title: "Ep",
          sort_title: "s01e01",
          season_number: 1,
          episode_number: 1,
          provider: "tmdb",
          provider_id: "e3",
          parent_id: "season-3",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("media_file")
      .values([
        {
          id: "tv-file-1",
          library_id: "library-tv",
          media_item_id: "ep-1",
          path: path.join(tempDir, "seed.mkv"),
          basename: "seed.mkv",
          extension: ".mkv",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mkv",
          created_at: now,
          updated_at: now,
        },
        {
          id: "tv-file-2",
          library_id: "library-tv",
          media_item_id: "ep-2",
          path: path.join(tempDir, "strong.mkv"),
          basename: "strong.mkv",
          extension: ".mkv",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mkv",
          created_at: now,
          updated_at: now,
        },
        {
          id: "tv-file-3",
          library_id: "library-tv",
          media_item_id: "ep-3",
          path: path.join(tempDir, "weak.mkv"),
          basename: "weak.mkv",
          extension: ".mkv",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mkv",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("media_item_genre")
      .values([
        { media_item_id: "show-1", provider: "tmdb", provider_id: "g1", name: "Drama", position: 0 },
        { media_item_id: "show-2", provider: "tmdb", provider_id: "g1", name: "Drama", position: 0 },
      ])
      .execute();
    await db
      .insertInto("media_item_keyword")
      .values([
        { media_item_id: "show-1", provider: "tmdb", provider_id: "k1", name: "space" },
        { media_item_id: "show-2", provider: "tmdb", provider_id: "k1", name: "space" },
      ])
      .execute();
    await db
      .insertInto("media_item_credit")
      .values([
        {
          media_item_id: "show-1",
          credit_type: "cast",
          provider: "tmdb",
          provider_id: "p1",
          credit_id: "sc1",
          name: "Actor One",
          original_name: "Actor One",
          profile_path: null,
          credit_order: 0,
          department: null,
          job: null,
          character_name: null,
        },
        {
          media_item_id: "show-2",
          credit_type: "cast",
          provider: "tmdb",
          provider_id: "p1",
          credit_id: "sc2",
          name: "Actor One",
          original_name: "Actor One",
          profile_path: null,
          credit_order: 0,
          department: null,
          job: null,
          character_name: null,
        },
        {
          media_item_id: "show-3",
          credit_type: "cast",
          provider: "tmdb",
          provider_id: "p1",
          credit_id: "sc3",
          name: "Actor One",
          original_name: "Actor One",
          profile_path: null,
          credit_order: 0,
          department: null,
          job: null,
          character_name: null,
        },
      ])
      .execute();

    const response = await similarShowsGet({
      params: { id: "show-1" },
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/shows/show-1/similar"),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      show: { id: "show-1", title: "Seed Show" },
      shows: [{ id: "show-2" }, { id: "show-3" }],
      page: {
        page: 1,
        pageSize: 24,
        total: 2,
        hasPrevious: false,
        hasNext: false,
      },
    });

    const limited = await similarShowsGet({
      params: { id: "show-1" },
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/shows/show-1/similar?limit=1"),
    } as never);

    expect(limited.status).toBe(200);
    expect(await limited.json()).toMatchObject({
      shows: [{ id: "show-2" }],
      page: {
        page: 1,
        pageSize: 1,
        total: 2,
        totalPages: 2,
        hasNext: true,
      },
    });
  });

  test("returns 404 when the source show is inaccessible", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-similar-shows-api-missing-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();

    const response = await similarShowsGet({
      params: { id: "missing-show" },
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/shows/missing-show/similar"),
    } as never);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ detail: "Show not found." });
  });
});
