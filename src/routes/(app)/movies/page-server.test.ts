import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests, type Database } from "$lib/server/db";
import { load as continueLoad } from "../continue/+page.server";
import { load as moviesLoad } from "./+page.server";

type MovieRow = {
  id: string;
  title: string;
  resumeFileId: string | null;
  progressSeconds: number;
  completed: boolean;
  path?: string;
  sortTitle?: string;
  progressUpdatedAt?: string | null;
  latestFileCreatedAt?: string | null;
};

type MoviesLoadResult = {
  query: string;
  status: string;
  sort: string;
  page: number;
  rows: {
    all: MovieRow[];
    continueWatching: MovieRow[];
    allPage: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasPrevious: boolean;
      hasNext: boolean;
    };
  };
};

type ContinueLoadResult = {
  movies: MovieRow[];
  episodes: Array<{ id: string }>;
  nextUp: Array<{ id: string }>;
};

describe("movies page server", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-movies-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Browse User",
        email: "browse@example.com",
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
      .values([
        {
          id: "movie-alpha",
          kind: "movie",
          title: "Alpha",
          sort_title: "alpha",
          year: 2020,
          overview: null,
          runtime_seconds: null,
          poster_path: "/alpha.jpg",
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
          id: "movie-bravo",
          kind: "movie",
          title: "Bravo",
          sort_title: "bravo",
          year: 2022,
          overview: null,
          runtime_seconds: null,
          poster_path: "/bravo.jpg",
          backdrop_path: null,
          release_date: "2022-01-01",
          provider: "tmdb",
          provider_id: "200",
          parent_id: null,
          popularity: 5,
          vote_average: 8,
          created_at: now,
          updated_at: now,
        },
        {
          id: "movie-charlie",
          kind: "movie",
          title: "Charlie",
          sort_title: "charlie",
          year: 2021,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2021-01-01",
          provider: null,
          provider_id: null,
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
          id: "file-alpha",
          library_id: "library-1",
          media_item_id: "movie-alpha",
          path: path.join(tempDir, "Alpha.2020.mp4"),
          basename: "Alpha.2020.mp4",
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
          id: "file-bravo",
          library_id: "library-1",
          media_item_id: "movie-bravo",
          path: path.join(tempDir, "Bravo.2022.mp4"),
          basename: "Bravo.2022.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: new Date(nowMs + 1000).toISOString(),
          updated_at: now,
        },
        {
          id: "file-charlie",
          library_id: "library-1",
          media_item_id: "movie-charlie",
          path: path.join(tempDir, "Charlie.2021.mp4"),
          basename: "Charlie.2021.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: new Date(nowMs + 2000).toISOString(),
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("watch_progress")
      .values([
        {
          user_id: "user-1",
          media_item_id: "movie-alpha",
          media_file_id: "file-alpha",
          position_seconds: 100,
          duration_seconds: 100,
          completed: 1,
          updated_at: new Date(nowMs).toISOString(),
        },
        {
          user_id: "user-1",
          media_item_id: "movie-bravo",
          media_file_id: "file-bravo",
          position_seconds: 45,
          duration_seconds: 100,
          completed: 0,
          updated_at: new Date(nowMs + 1000).toISOString(),
        },
      ])
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests?.();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("loads browse rows from search, watch-status, and sort query parameters", async () => {
    const result = (await moviesLoad({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/movies?q=rav&status=unwatched&sort=rating"),
    } as never)) as MoviesLoadResult;

    expect(result).toMatchObject({
      query: "rav",
      status: "unwatched",
      sort: "rating",
      page: 1,
    });
    expect(result.rows.all).toHaveLength(1);
    expect(result.rows.all[0]).toMatchObject({
      id: "movie-bravo",
      title: "Bravo",
      resumeFileId: "file-bravo",
      progressSeconds: 45,
      completed: false,
    });
    expect(result.rows.all[0].path).toBeUndefined();
    expect(result.rows.all[0].sortTitle).toBeUndefined();
    expect(result.rows.all[0].progressUpdatedAt).toBeUndefined();
    expect(result.rows.all[0].latestFileCreatedAt).toBeUndefined();
  });

  test("normalizes invalid browse query parameters", async () => {
    const result = (await moviesLoad({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/movies?status=watchedish&sort=unknown"),
    } as never)) as MoviesLoadResult;

    expect(result.status).toBe("all");
    expect(result.sort).toBe("title");
    expect(result.page).toBe(1);
    expect(result.rows.all.map((movie) => movie.id)).toEqual(["movie-alpha", "movie-bravo", "movie-charlie"]);
  });

  test("clamps out-of-range movies pages", async () => {
    const result = (await moviesLoad({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/movies?page=2"),
    } as never)) as MoviesLoadResult;

    expect(result.page).toBe(1);
    expect(result.rows.allPage.page).toBe(1);
    expect(result.rows.allPage.total).toBe(3);
    expect(result.rows.all.map((movie) => movie.id)).toEqual(["movie-alpha", "movie-bravo", "movie-charlie"]);
  });

  test("loads only resumable movies for continue watching", async () => {
    const result = (await continueLoad({
      locals: { user: { id: "user-1", role: "user" } },
    } as never)) as ContinueLoadResult;

    expect(result.movies).toHaveLength(1);
    expect(result.movies[0]).toMatchObject({
      id: "movie-bravo",
      resumeFileId: "file-bravo",
      progressSeconds: 45,
      completed: false,
    });
    expect(result.episodes).toEqual([]);
    expect(result.nextUp).toEqual([]);
  });
});
