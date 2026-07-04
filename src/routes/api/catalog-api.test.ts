import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { GET as moviesGet } from "./movies/+server";

describe("catalog API access", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function setupCatalog() {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-catalog-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    const db = await getDb();
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    await db
      .insertInto("user")
      .values([
        {
          id: "user-1",
          name: "User",
          email: "user@example.com",
          role: "user",
          email_verified: 0,
          image: null,
          created_at: nowMs,
          updated_at: nowMs,
        },
        {
          id: "user-2",
          name: "Other",
          email: "other@example.com",
          role: "user",
          email_verified: 0,
          image: null,
          created_at: nowMs,
          updated_at: nowMs,
        },
      ])
      .execute();
    await db
      .insertInto("library")
      .values({
        id: "library-1",
        name: "Shared Movies",
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
      .values({
        id: "movie-1",
        kind: "movie",
        title: "Shared Movie",
        sort_title: "shared movie",
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
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "file-1",
        library_id: "library-1",
        media_item_id: "movie-1",
        path: path.join(tempDir, "movies", "Shared.Movie.2026.mp4"),
        basename: "Shared.Movie.2026.mp4",
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

  test("movie API only returns libraries shared with the caller", async () => {
    await setupCatalog();

    const sharedResponse = await moviesGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/movies"),
    } as never);
    expect(sharedResponse.status).toBe(200);
    expect(await sharedResponse.json()).toMatchObject({
      all: [
        {
          id: "movie-1",
          title: "Shared Movie",
        },
      ],
    });

    const deniedResponse = await moviesGet({
      locals: { user: { id: "user-2", role: "user" } },
      url: new URL("http://localhost/api/movies"),
    } as never);
    expect(deniedResponse.status).toBe(200);
    expect(await deniedResponse.json()).toMatchObject({
      all: [],
    });
  });

  test("movie API can return a single browse rail", async () => {
    await setupCatalog();

    const response = await moviesGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/movies?rail=popular"),
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      popular: [{ id: "movie-1", title: "Shared Movie" }],
    });
    expect(body).not.toHaveProperty("all");
    expect(body).not.toHaveProperty("continueWatching");
  });

  test("movie API rejects invalid browse rails", async () => {
    await setupCatalog();

    const response = await moviesGet({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/movies?rail=nextUp"),
    } as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Invalid rail") });
  });
});
