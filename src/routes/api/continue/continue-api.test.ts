import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { GET as continueGet } from "./+server";
import { GET as continueMoviesGet } from "./movies/+server";
import { GET as continueEpisodesGet } from "./episodes/+server";

describe("continue watching API", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function setupContinue() {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-continue-api-"));
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

  test("continue API returns both movies and episodes", async () => {
    await setupContinue();
    const db = await getDb();
    const now = new Date().toISOString();

    await db
      .insertInto("watch_progress")
      .values([
        {
          user_id: "user-1",
          media_item_id: "movie-1",
          media_file_id: "file-1",
          position_seconds: 120,
          duration_seconds: 3600,
          completed: 0,
          updated_at: now,
        },
        {
          user_id: "user-1",
          media_item_id: "episode-1",
          media_file_id: "file-1",
          position_seconds: 60,
          duration_seconds: 1800,
          completed: 0,
          updated_at: now,
        },
      ])
      .execute();

    const response = await continueGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/continue"),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.movies).toHaveLength(1);
    expect(body.episodes).toHaveLength(1);
  });

  test("continue movies API returns only movies", async () => {
    await setupContinue();
    const db = await getDb();
    const now = new Date().toISOString();

    await db
      .insertInto("watch_progress")
      .values([
        {
          user_id: "user-1",
          media_item_id: "movie-1",
          media_file_id: "file-1",
          position_seconds: 120,
          duration_seconds: 3600,
          completed: 0,
          updated_at: now,
        },
        {
          user_id: "user-1",
          media_item_id: "episode-1",
          media_file_id: "file-1",
          position_seconds: 60,
          duration_seconds: 1800,
          completed: 0,
          updated_at: now,
        },
      ])
      .execute();

    const response = await continueMoviesGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/continue/movies"),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.movies).toHaveLength(1);
    expect(body.pageInfo).toMatchObject({
      page: 1,
      total: 1,
    });
  });

  test("continue episodes API returns only episodes", async () => {
    await setupContinue();
    const db = await getDb();
    const now = new Date().toISOString();

    await db
      .insertInto("watch_progress")
      .values([
        {
          user_id: "user-1",
          media_item_id: "movie-1",
          media_file_id: "file-1",
          position_seconds: 120,
          duration_seconds: 3600,
          completed: 0,
          updated_at: now,
        },
        {
          user_id: "user-1",
          media_item_id: "episode-1",
          media_file_id: "file-1",
          position_seconds: 60,
          duration_seconds: 1800,
          completed: 0,
          updated_at: now,
        },
      ])
      .execute();

    const response = await continueEpisodesGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/continue/episodes"),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.episodes).toHaveLength(1);
    expect(body.episodesPage).toMatchObject({
      page: 1,
      total: 1,
    });
  });

  test("continue API honors page and limit params", async () => {
    await setupContinue();
    const db = await getDb();
    const now = new Date().toISOString();

    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-1",
        media_file_id: "file-1",
        position_seconds: 120,
        duration_seconds: 3600,
        completed: 0,
        updated_at: now,
      })
      .execute();

    const response = await continueMoviesGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/continue/movies?limit=10"),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pageInfo).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
    });
  });

  test("continue API only returns items for the authenticated user", async () => {
    await setupContinue();
    const db = await getDb();
    const now = new Date().toISOString();

    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-1",
        media_file_id: "file-1",
        position_seconds: 120,
        duration_seconds: 3600,
        completed: 0,
        updated_at: now,
      })
      .execute();

    const response = await continueMoviesGet({
      locals: { user: { id: "user-2", role: "user" } },
      url: new URL("http://localhost/api/continue/movies"),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.movies).toHaveLength(0);
  });
});
