import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { GET as episodeGet } from "./[id]/+server";
import { POST as episodeWatchedPost } from "./[id]/watched/+server";

describe("episodes API", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function setupEpisodes() {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-episodes-api-"));
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
        name: "TV Shows",
        kind: "tv",
        access_mode: "shared",
        path: path.join(tempDir, "shows"),
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
        media_item_id: "episode-1",
        path: path.join(tempDir, "shows", "Episode.1.mp4"),
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

  test("GET /api/episodes/[id] returns episode detail", async () => {
    await setupEpisodes();

    const response = await episodeGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "episode-1" },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      episode: {
        id: "episode-1",
        title: "Episode 1",
      },
    });
  });

  test("GET /api/episodes/[id] returns 404 for non-existent episode", async () => {
    await setupEpisodes();

    const response = await episodeGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "non-existent" },
    } as never);

    expect(response.status).toBe(404);
  });

  test("POST /api/episodes/[id]/watched marks episode as watched", async () => {
    await setupEpisodes();

    const response = await episodeWatchedPost({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "episode-1" },
      request: new Request("http://localhost/api/episodes/episode-1/watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaFileId: "file-1", completed: true }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  test("POST /api/episodes/[id]/watched returns 401 without user", async () => {
    await setupEpisodes();

    const response = await episodeWatchedPost({
      locals: { user: null },
      params: { id: "episode-1" },
      request: new Request("http://localhost/api/episodes/episode-1/watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaFileId: "file-1" }),
      }),
    } as never);

    expect(response.status).toBe(401);
  });
});
