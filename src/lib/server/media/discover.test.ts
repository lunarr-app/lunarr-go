import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { getSimilarMovies, listBecauseYouWatchedMovies } from "./movies/discover";
import { getSimilarShows, listBecauseYouWatchedShows } from "./shows/discover";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";

describe("similar media", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-similar-media-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

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
      .values([
        {
          id: "library-1",
          name: "Movies",
          kind: "movie",
          path: path.join(tempDir, "movies"),
          access_mode: "all",
          created_at: now,
          updated_at: now,
        },
        {
          id: "library-2",
          name: "Hidden",
          kind: "movie",
          path: path.join(tempDir, "hidden"),
          access_mode: "shared",
          created_at: now,
          updated_at: now,
        },
      ])
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
          poster_path: "/seed.jpg",
          release_date: "2020-01-01",
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
          poster_path: "/m2.jpg",
          release_date: "2021-01-01",
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
          poster_path: "/m3.jpg",
          release_date: "2019-01-01",
          popularity: 200,
          provider: "tmdb",
          provider_id: "movie-3",
          parent_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "movie-no-file",
          kind: "movie",
          title: "Metadata only",
          sort_title: "metadata only",
          year: 2022,
          poster_path: "/nofile.jpg",
          release_date: "2022-01-01",
          provider: "tmdb",
          provider_id: "movie-no-file",
          parent_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "movie-hidden",
          kind: "movie",
          title: "Inaccessible",
          sort_title: "inaccessible",
          year: 2023,
          poster_path: "/hidden.jpg",
          release_date: "2023-01-01",
          provider: "tmdb",
          provider_id: "movie-hidden",
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
          id: "file-seed",
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
        {
          id: "file-hidden",
          library_id: "library-2",
          media_item_id: "movie-hidden",
          path: path.join(tempDir, "Hidden.mp4"),
          basename: "Hidden.mp4",
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

    // Seed movie metadata
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

    // An inaccessible but otherwise “similar” movie should be filtered out.
    await db
      .insertInto("media_item_genre")
      .values({ media_item_id: "movie-hidden", provider: "tmdb", provider_id: "g1", name: "Action", position: 0 })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("ranks similar movies by weighted overlap and excludes inaccessible items", async () => {
    const results = await getSimilarMovies("movie-1", "user-1", 1, 12);
    expect(results.movies.map((movie) => movie.id)).toEqual(["movie-2", "movie-3"]);
    expect(results.movies.some((movie) => movie.id === "movie-hidden")).toBe(false);
    expect(results.movies.some((movie) => movie.id === "movie-no-file")).toBe(false);
    expect(results.movies.some((movie) => movie.id === "movie-1")).toBe(false);
    expect(results.page.total).toBe(2);
  });

  test("ranks similar shows by weighted overlap and filters to playable shows", async () => {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

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
        // Weak show only shares cast (lower score than show-2 which shares genre+keyword+cast)
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

    const results = await getSimilarShows("show-1", "user-1", 1, 12);
    expect(results.shows.map((show) => show.id)).toEqual(["show-2", "show-3"]);
    expect(results.shows.some((show) => show.id === "show-1")).toBe(false);
    expect(results.page.total).toBe(2);

    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "ep-1",
        media_file_id: "tv-file-1",
        position_seconds: 120,
        duration_seconds: 6000,
        completed: 0,
        updated_at: now,
      })
      .execute();

    const showList = await listBecauseYouWatchedShows("user-1");
    expect(showList.shows.map((show) => show.id)).toEqual(["show-2", "show-3"]);
    expect(showList.page.total).toBe(2);

    const showPage = await listBecauseYouWatchedShows("user-1", 1, 1);
    expect(showPage.shows.map((show) => show.id)).toEqual(["show-2"]);
    expect(showPage.page.total).toBe(2);
    expect(showPage.page.totalPages).toBe(2);
  });

  test("because you watched recommends similar unwatched titles from recent seeds", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-1",
        media_file_id: "file-seed",
        position_seconds: 120,
        duration_seconds: 6000,
        completed: 0,
        updated_at: now,
      })
      .execute();

    const list = await listBecauseYouWatchedMovies("user-1");
    expect(list.movies.map((movie) => movie.id)).toEqual(["movie-2", "movie-3"]);
    expect(list.movies.some((movie) => movie.id === "movie-1")).toBe(false);
    expect(list.page.total).toBe(2);

    const page = await listBecauseYouWatchedMovies("user-1", 1, 1);
    expect(page.movies.map((movie) => movie.id)).toEqual(["movie-2"]);
    expect(page.page.total).toBe(2);
    expect(page.page.totalPages).toBe(2);
  });

  test("because you watched excludes completed titles", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("watch_progress")
      .values([
        {
          user_id: "user-1",
          media_item_id: "movie-1",
          media_file_id: "file-seed",
          position_seconds: 120,
          duration_seconds: 6000,
          completed: 0,
          updated_at: now,
        },
        {
          user_id: "user-1",
          media_item_id: "movie-2",
          media_file_id: "file-2",
          position_seconds: 6000,
          duration_seconds: 6000,
          completed: 1,
          updated_at: now,
        },
      ])
      .execute();

    const list = await listBecauseYouWatchedMovies("user-1");
    expect(list.movies.map((movie) => movie.id)).toEqual(["movie-3"]);
  });
});
