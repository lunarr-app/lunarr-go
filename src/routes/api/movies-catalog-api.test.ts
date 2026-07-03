import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { GET as movieGet } from "./movies/[id]/+server";
import { GET as creditsGet } from "./movies/[id]/credits/+server";
import { GET as overviewGet } from "./movies/[id]/overview/+server";

describe("movie catalog API", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function setupMovieCatalog() {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-movie-catalog-api-"));
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
      .values({
        id: "movie-1",
        kind: "movie",
        title: "The Matrix",
        sort_title: "matrix",
        year: 1999,
        overview: "A hacker discovers reality is a simulation.",
        poster_path: "/matrix.jpg",
        backdrop_path: "/matrix-backdrop.jpg",
        release_date: "1999-03-31",
        provider: "tmdb",
        provider_id: "603",
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
        path: path.join(tempDir, "movies", "The Matrix (1999).mkv"),
        basename: "The Matrix (1999).mkv",
        extension: ".mkv",
        size_bytes: 10,
        mtime_ms: nowMs,
        duration_seconds: 8160,
        video_codec: null,
        audio_codec: null,
        container: "mkv",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-1",
        media_file_id: "file-1",
        position_seconds: 120,
        duration_seconds: 8160,
        completed: 0,
        updated_at: now,
      })
      .execute();
  }

  test("overview endpoint returns metadata, files, and progress without cast", async () => {
    await setupMovieCatalog();

    const response = await overviewGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "movie-1" },
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      movie: { id: "movie-1", title: "The Matrix" },
      files: [{ id: "file-1", basename: "The Matrix (1999).mkv" }],
      progress: [{ media_file_id: "file-1", position_seconds: 120, completed: 0 }],
    });
    expect(body).not.toHaveProperty("cast");
  });

  test("credits endpoint returns cast, directors, and writers", async () => {
    await setupMovieCatalog();
    await (
      await getDb()
    )
      .insertInto("media_item_credit")
      .values([
        {
          media_item_id: "movie-1",
          credit_type: "cast",
          provider: "tmdb",
          provider_id: "person-1",
          credit_id: "credit-1",
          name: "Keanu Reeves",
          original_name: "Keanu Reeves",
          profile_path: "/keanu.jpg",
          credit_order: 0,
          department: null,
          job: null,
          character_name: "Neo",
        },
        {
          media_item_id: "movie-1",
          credit_type: "crew",
          provider: "tmdb",
          provider_id: "person-2",
          credit_id: "credit-2",
          name: "Lana Wachowski",
          original_name: "Lana Wachowski",
          profile_path: null,
          credit_order: 0,
          department: "Directing",
          job: "Director",
          character_name: null,
        },
      ])
      .execute();

    const response = await creditsGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "movie-1" },
    } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      show: { id: "movie-1", title: "The Matrix" },
      cast: [{ name: "Keanu Reeves", character: "Neo" }],
      directors: ["Lana Wachowski"],
      writers: [],
    });
  });

  test("full movie endpoint still returns cast", async () => {
    await setupMovieCatalog();
    await (
      await getDb()
    )
      .insertInto("media_item_credit")
      .values({
        media_item_id: "movie-1",
        credit_type: "cast",
        provider: "tmdb",
        provider_id: "person-1",
        credit_id: "credit-1",
        name: "Keanu Reeves",
        original_name: "Keanu Reeves",
        profile_path: "/keanu.jpg",
        credit_order: 0,
        department: null,
        job: null,
        character_name: "Neo",
      })
      .execute();

    const response = await movieGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "movie-1" },
    } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      movie: { id: "movie-1", title: "The Matrix" },
      cast: [{ name: "Keanu Reeves", character: "Neo" }],
    });
  });
});
