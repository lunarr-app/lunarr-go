import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import {
  isInWatchlist,
  toggleWatchlist,
  removeFromWatchlist,
  getWatchlistMovies,
  getWatchlistShows,
} from "./watchlist";

describe("watchlist service", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function setupWatchlist() {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-watchlist-"));
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
        access_mode: "shared",
        path: path.join(tempDir, "movies"),
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("library_user")
      .values({
        library_id: "library-1",
        user_id: "user-1",
        created_at: now,
      })
      .execute();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "movie-1",
          kind: "movie",
          title: "Movie One",
          sort_title: "movie one",
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
        },
        {
          id: "movie-2",
          kind: "movie",
          title: "Movie Two",
          sort_title: "movie two",
          year: 2026,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2026-01-02",
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
          title: "Show One",
          sort_title: "show one",
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
        },
        {
          id: "season-1",
          kind: "season",
          title: "Season 1",
          sort_title: "season 1",
          year: 2026,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2026-01-01",
          provider: null,
          provider_id: null,
          parent_id: "show-1",
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "episode-1",
          kind: "episode",
          title: "Episode 1",
          sort_title: "episode 1",
          year: 2026,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2026-01-01",
          provider: null,
          provider_id: null,
          parent_id: "season-1",
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "file-1",
        library_id: "library-1",
        media_item_id: "movie-1",
        path: path.join(tempDir, "movies", "Movie.One.2026.mp4"),
        basename: "Movie.One.2026.mp4",
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
      .insertInto("media_file")
      .values({
        id: "file-2",
        library_id: "library-1",
        media_item_id: "episode-1",
        path: path.join(tempDir, "movies", "Episode.1.mp4"),
        basename: "Episode.1.mp4",
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
  }

  test("isInWatchlist returns false when not in watchlist", async () => {
    await setupWatchlist();
    const result = await isInWatchlist("user-1", "movie-1");
    expect(result).toBe(false);
  });

  test("isInWatchlist returns true when in watchlist", async () => {
    await setupWatchlist();
    await toggleWatchlist("user-1", "movie-1");
    const result = await isInWatchlist("user-1", "movie-1");
    expect(result).toBe(true);
  });

  test("toggleWatchlist adds item to watchlist", async () => {
    await setupWatchlist();
    const result = await toggleWatchlist("user-1", "movie-1");
    expect(result).toBe(true);
    expect(await isInWatchlist("user-1", "movie-1")).toBe(true);
  });

  test("toggleWatchlist removes item from watchlist", async () => {
    await setupWatchlist();
    await toggleWatchlist("user-1", "movie-1");
    const result = await toggleWatchlist("user-1", "movie-1");
    expect(result).toBe(false);
    expect(await isInWatchlist("user-1", "movie-1")).toBe(false);
  });

  test("removeFromWatchlist removes item", async () => {
    await setupWatchlist();
    await toggleWatchlist("user-1", "movie-1");
    await removeFromWatchlist("user-1", "movie-1");
    expect(await isInWatchlist("user-1", "movie-1")).toBe(false);
  });

  test("getWatchlistMovies returns movies in watchlist", async () => {
    await setupWatchlist();
    const db = await getDb();
    const now = new Date().toISOString();
    const nowMs = Date.now();

    await db
      .insertInto("media_file")
      .values({
        id: "file-3",
        library_id: "library-1",
        media_item_id: "movie-2",
        path: path.join(tempDir!, "movies", "Movie.Two.2026.mp4"),
        basename: "Movie.Two.2026.mp4",
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
    await toggleWatchlist("user-1", "movie-1");
    await toggleWatchlist("user-1", "movie-2");

    const result = await getWatchlistMovies("user-1");
    expect(result.movies).toHaveLength(2);
    expect(result.pageInfo.total).toBe(2);
  });

  test("getWatchlistMovies excludes shows", async () => {
    await setupWatchlist();
    await toggleWatchlist("user-1", "movie-1");
    await toggleWatchlist("user-1", "show-1");

    const result = await getWatchlistMovies("user-1");
    expect(result.movies).toHaveLength(1);
    expect(result.movies[0].id).toBe("movie-1");
  });

  test("getWatchlistShows returns shows in watchlist", async () => {
    await setupWatchlist();
    await toggleWatchlist("user-1", "show-1");

    const result = await getWatchlistShows("user-1");
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].id).toBe("show-1");
  });

  test("getWatchlistShows excludes movies", async () => {
    await setupWatchlist();
    await toggleWatchlist("user-1", "movie-1");
    await toggleWatchlist("user-1", "show-1");

    const result = await getWatchlistShows("user-1");
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].id).toBe("show-1");
  });

  test("getWatchlistMovies respects pagination", async () => {
    await setupWatchlist();
    const db = await getDb();
    const now = new Date().toISOString();
    const nowMs = Date.now();

    await db
      .insertInto("media_file")
      .values({
        id: "file-3",
        library_id: "library-1",
        media_item_id: "movie-2",
        path: path.join(tempDir!, "movies", "Movie.Two.2026.mp4"),
        basename: "Movie.Two.2026.mp4",
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
    await toggleWatchlist("user-1", "movie-1");
    await toggleWatchlist("user-1", "movie-2");

    const page1 = await getWatchlistMovies("user-1", 1, 1);
    expect(page1.movies).toHaveLength(1);
    expect(page1.pageInfo.hasNext).toBe(true);

    const page2 = await getWatchlistMovies("user-1", 2, 1);
    expect(page2.movies).toHaveLength(1);
    expect(page2.pageInfo.hasNext).toBe(false);
  });

  test("getWatchlistMovies only returns items for specified user", async () => {
    await setupWatchlist();
    const db = await getDb();
    const now = new Date().toISOString();

    await db
      .insertInto("user")
      .values({
        id: "user-2",
        name: "Other",
        email: "other@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      })
      .execute();
    await toggleWatchlist("user-1", "movie-1");
    await toggleWatchlist("user-2", "movie-2");

    const result = await getWatchlistMovies("user-1");
    expect(result.movies).toHaveLength(1);
    expect(result.movies[0].id).toBe("movie-1");
  });
});
