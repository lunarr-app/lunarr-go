import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { GET as watchlistGet } from "./+server";
import { GET as watchlistMoviesGet } from "./movies/+server";
import { GET as watchlistShowsGet } from "./shows/+server";
import { POST as watchlistPost } from "./+server";
import { GET as watchlistStatusGet } from "./[mediaItemId]/+server";
import { DELETE as watchlistDelete } from "./[mediaItemId]/+server";

describe("watchlist API", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function setupWatchlist() {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-watchlist-api-"));
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
  }

  test("toggle watchlist adds item", async () => {
    await setupWatchlist();

    const response = await watchlistPost({
      locals: { user: { id: "user-1", role: "user" } },
      request: new Request("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaItemId: "movie-1" }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      inWatchlist: true,
    });
  });

  test("toggle watchlist removes item", async () => {
    await setupWatchlist();
    const db = await getDb();
    const now = new Date().toISOString();

    await db.insertInto("watchlist").values({ user_id: "user-1", media_item_id: "movie-1", created_at: now }).execute();

    const response = await watchlistPost({
      locals: { user: { id: "user-1", role: "user" } },
      request: new Request("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaItemId: "movie-1" }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      inWatchlist: false,
    });
  });

  test("watchlist API returns both movies and shows", async () => {
    await setupWatchlist();
    const db = await getDb();
    const now = new Date().toISOString();
    const nowMs = Date.now();

    await db
      .insertInto("media_item")
      .values([
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
        id: "file-2",
        library_id: "library-1",
        media_item_id: "episode-1",
        path: path.join(tempDir!, "movies", "Episode.1.mp4"),
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
    await db
      .insertInto("watchlist")
      .values([
        { user_id: "user-1", media_item_id: "movie-1", created_at: now },
        { user_id: "user-1", media_item_id: "show-1", created_at: now },
      ])
      .execute();

    const response = await watchlistGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/watchlist"),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.movies).toHaveLength(1);
    expect(body.shows).toHaveLength(1);
    expect(body.movies[0].id).toBe("movie-1");
    expect(body.shows[0].id).toBe("show-1");
  });

  test("watchlist movies API returns only movies", async () => {
    await setupWatchlist();
    const db = await getDb();
    const now = new Date().toISOString();
    const nowMs = Date.now();

    await db
      .insertInto("media_file")
      .values({
        id: "file-2",
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
    await db
      .insertInto("watchlist")
      .values([
        { user_id: "user-1", media_item_id: "movie-1", created_at: now },
        { user_id: "user-1", media_item_id: "movie-2", created_at: now },
        { user_id: "user-1", media_item_id: "show-1", created_at: now },
      ])
      .execute();

    const response = await watchlistMoviesGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/watchlist/movies"),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.movies).toHaveLength(2);
    expect(body.pageInfo).toMatchObject({
      page: 1,
      total: 2,
    });
  });

  test("watchlist shows API returns only shows", async () => {
    await setupWatchlist();
    const db = await getDb();
    const now = new Date().toISOString();
    const nowMs = Date.now();

    await db
      .insertInto("media_item")
      .values([
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
        id: "file-2",
        library_id: "library-1",
        media_item_id: "episode-1",
        path: path.join(tempDir!, "movies", "Episode.1.mp4"),
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
    await db
      .insertInto("watchlist")
      .values([
        { user_id: "user-1", media_item_id: "movie-1", created_at: now },
        { user_id: "user-1", media_item_id: "show-1", created_at: now },
      ])
      .execute();

    const response = await watchlistShowsGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/watchlist/shows"),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.shows).toHaveLength(1);
    expect(body.pageInfo).toMatchObject({
      page: 1,
      total: 1,
    });
  });

  test("watchlist API honors page and limit params", async () => {
    await setupWatchlist();
    const db = await getDb();
    const now = new Date().toISOString();

    await db
      .insertInto("watchlist")
      .values([
        { user_id: "user-1", media_item_id: "movie-1", created_at: now },
        { user_id: "user-1", media_item_id: "movie-2", created_at: now },
      ])
      .execute();

    const response = await watchlistMoviesGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/watchlist/movies?limit=1"),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.movies).toHaveLength(1);
    expect(body.pageInfo).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
      hasNext: true,
    });
  });

  test("watchlist status endpoint returns true for watchlisted item", async () => {
    await setupWatchlist();
    const db = await getDb();
    const now = new Date().toISOString();

    await db.insertInto("watchlist").values({ user_id: "user-1", media_item_id: "movie-1", created_at: now }).execute();

    const response = await watchlistStatusGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { mediaItemId: "movie-1" },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ inWatchlist: true });
  });

  test("watchlist status endpoint returns false for non-watchlisted item", async () => {
    await setupWatchlist();

    const response = await watchlistStatusGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { mediaItemId: "movie-1" },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ inWatchlist: false });
  });

  test("watchlist status endpoint only checks for the authenticated user", async () => {
    await setupWatchlist();
    const db = await getDb();
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    await db
      .insertInto("user")
      .values({
        id: "user-2",
        name: "Other",
        email: "other@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: nowMs,
        updated_at: nowMs,
      })
      .execute();
    await db.insertInto("watchlist").values({ user_id: "user-2", media_item_id: "movie-1", created_at: now }).execute();

    const response = await watchlistStatusGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { mediaItemId: "movie-1" },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ inWatchlist: false });
  });

  test("delete watchlist endpoint removes item", async () => {
    await setupWatchlist();
    const db = await getDb();
    const now = new Date().toISOString();

    await db.insertInto("watchlist").values({ user_id: "user-1", media_item_id: "movie-1", created_at: now }).execute();

    const response = await watchlistDelete({
      locals: { user: { id: "user-1", role: "user" } },
      params: { mediaItemId: "movie-1" },
    } as never);

    expect(response.status).toBe(204);

    const checkResponse = await watchlistGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/watchlist"),
    } as never);
    const body = await checkResponse.json();
    expect(body.movies).toHaveLength(0);
  });

  test("watchlist API only returns items for the authenticated user", async () => {
    await setupWatchlist();
    const db = await getDb();
    const now = new Date().toISOString();

    await db
      .insertInto("watchlist")
      .values([{ user_id: "user-1", media_item_id: "movie-1", created_at: now }])
      .execute();

    const response = await watchlistMoviesGet({
      locals: { user: { id: "user-2", role: "user" } },
      url: new URL("http://localhost/api/watchlist/movies"),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.movies).toHaveLength(0);
  });
});
