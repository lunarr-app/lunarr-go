import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { getMediaFile } from "./files";
import { getMovieDetail, movieRows } from "./movies";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";

describe("movieRows", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-media-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
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
          id: "movie-a",
          kind: "movie",
          title: "Alpha",
          sort_title: "alpha",
          year: 2020,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2020-01-01",
          provider: null,
          provider_id: null,
          parent_id: null,
          popularity: 1,
          vote_average: 6,
          created_at: now,
          updated_at: now,
        },
        {
          id: "movie-b",
          kind: "movie",
          title: "Bravo",
          sort_title: "bravo",
          year: 2022,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2022-01-01",
          provider: null,
          provider_id: null,
          parent_id: null,
          popularity: 5,
          vote_average: 8,
          created_at: now,
          updated_at: now,
        },
        {
          id: "metadata-only",
          kind: "movie",
          title: "Metadata Only",
          sort_title: "metadata only",
          year: 2023,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2023-01-01",
          provider: null,
          provider_id: null,
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "show-a",
          kind: "show",
          title: "Show A",
          sort_title: "show a",
          year: 2024,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2024-01-01",
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
      .values([
        {
          id: "file-a",
          library_id: "library-1",
          media_item_id: "movie-a",
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
          id: "file-b",
          library_id: "library-1",
          media_item_id: "movie-b",
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
          id: "file-a-alt",
          library_id: "library-1",
          media_item_id: "movie-a",
          path: path.join(tempDir, "Alpha.2020.4k.mp4"),
          basename: "Alpha.2020.4k.mp4",
          extension: ".mp4",
          size_bytes: 20,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: new Date(nowMs + 2000).toISOString(),
          updated_at: now,
        },
        {
          id: "file-show-a",
          library_id: "library-1",
          media_item_id: "show-a",
          path: path.join(tempDir, "Show.A.mp4"),
          basename: "Show.A.mp4",
          extension: ".mp4",
          size_bytes: 30,
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
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-a",
        media_file_id: "file-a",
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

  test("filters by watched state and search text", async () => {
    expect((await movieRows("user-1", "", "watched")).all.map((movie) => movie.title)).toEqual(["Alpha"]);
    expect((await movieRows("user-1", "", "unwatched")).all.map((movie) => movie.title)).toEqual(["Bravo"]);
    expect((await movieRows("user-1", "rav", "all")).all.map((movie) => movie.title)).toEqual(["Bravo"]);
  });

  test("matches movies by original title, sort title, keywords, genres, and basename", async () => {
    await db.updateTable("media_item").set({ original_title: "Alpha Original" }).where("id", "=", "movie-a").execute();
    await db
      .insertInto("media_item_keyword")
      .values({
        media_item_id: "movie-b",
        provider: "tmdb",
        provider_id: "keyword-1",
        name: "undercover",
      })
      .execute();
    await db
      .updateTable("media_file")
      .set({ basename: "Dead.End.Street.1977.mkv" })
      .where("media_item_id", "=", "movie-b")
      .execute();

    await db
      .insertInto("media_item_genre")
      .values({
        media_item_id: "movie-a",
        provider: "tmdb",
        provider_id: "genre-1",
        name: "Horror",
        position: 0,
      })
      .execute();

    expect((await movieRows("user-1", "original", "all")).all.map((movie) => movie.title)).toEqual(["Alpha"]);
    expect((await movieRows("user-1", "horror", "all")).all.map((movie) => movie.title)).toEqual(["Alpha"]);
    expect((await movieRows("user-1", "undercover", "all")).all.map((movie) => movie.title)).toEqual(["Bravo"]);
    expect((await movieRows("user-1", "dead.end", "all")).all.map((movie) => movie.title)).toEqual(["Bravo"]);
    expect((await movieRows("user-1", "bravo", "all")).all.map((movie) => movie.title)).toEqual(["Bravo"]);
  });

  test("treats movie search wildcards as literal text", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values({
        id: "movie-percent",
        kind: "movie",
        title: "100% Real",
        sort_title: "100% real",
        year: 2025,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2025-01-01",
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
        id: "file-percent",
        library_id: "library-1",
        media_item_id: "movie-percent",
        path: path.join(tempDir, "100.Percent.Real.2025.mp4"),
        basename: "100.Percent.Real.2025.mp4",
        extension: ".mp4",
        size_bytes: 10,
        mtime_ms: Date.now(),
        duration_seconds: null,
        video_codec: null,
        audio_codec: null,
        container: "mp4",
        created_at: now,
        updated_at: now,
      })
      .execute();

    expect((await movieRows("user-1", "%", "all")).all.map((movie) => movie.title)).toEqual(["100% Real"]);
    expect((await movieRows("user-1", "_", "all")).all.map((movie) => movie.title)).toEqual([]);
  });

  test("sorts the main browse list", async () => {
    await db.updateTable("media_item").set({ sort_title: "aardvark" }).where("id", "=", "movie-b").execute();

    expect((await movieRows("user-1", "", "all", "title")).all.map((movie) => movie.title)).toEqual(["Bravo", "Alpha"]);
    expect((await movieRows("user-1", "", "all", "year_desc")).all.map((movie) => movie.title)).toEqual([
      "Bravo",
      "Alpha",
    ]);
    expect((await movieRows("user-1", "", "all", "rating")).all.map((movie) => movie.title)).toEqual([
      "Bravo",
      "Alpha",
    ]);
    expect((await movieRows("user-1", "", "all", "recent")).all.map((movie) => movie.title)).toEqual([
      "Alpha",
      "Bravo",
    ]);
  });

  test("paginates the main browse list", async () => {
    const rows = await movieRows("user-1", "", "all", "title", 2, 1);

    expect(rows.all.map((movie) => movie.title)).toEqual(["Bravo"]);
    expect(rows.allPage).toEqual({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
      hasPrevious: true,
      hasNext: false,
    });
  });

  test("marks a movie watched when any file is completed", async () => {
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-a",
        media_file_id: "file-a-alt",
        position_seconds: 40,
        duration_seconds: 100,
        completed: 0,
        updated_at: new Date(Date.now() + 1000).toISOString(),
      })
      .execute();

    const rows = await movieRows("user-1");
    expect(rows.all.find((movie) => movie.id === "movie-a")).toMatchObject({
      resumeFileId: "file-a-alt",
      progressSeconds: 40,
      durationSeconds: 100,
      completed: true,
    });
    expect(rows.continueWatching.map((movie) => movie.id)).toEqual([]);
    expect((await movieRows("user-1", "", "watched")).all.map((movie) => movie.id)).toEqual(["movie-a"]);
    expect((await movieRows("user-1", "", "unwatched")).all.map((movie) => movie.id)).toEqual(["movie-b"]);
  });

  test("limits shared libraries to selected users while admins retain access", async () => {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values([
        {
          id: "user-2",
          name: "Other User",
          email: "other@example.com",
          role: "user",
          email_verified: 0,
          image: null,
          created_at: nowMs,
          updated_at: nowMs,
        },
        {
          id: "admin-1",
          name: "Admin",
          email: "admin@example.com",
          role: "admin",
          email_verified: 0,
          image: null,
          created_at: nowMs,
          updated_at: nowMs,
        },
      ])
      .execute();
    await db.updateTable("library").set({ access_mode: "shared" }).where("id", "=", "library-1").execute();
    await db
      .insertInto("library_user")
      .values({
        library_id: "library-1",
        user_id: "user-1",
        created_at: now,
      })
      .execute();

    expect((await movieRows("user-1")).all.map((movie) => movie.id)).toEqual(["movie-a", "movie-b"]);
    expect((await movieRows("user-2")).all).toEqual([]);
    expect((await movieRows("admin-1")).all.map((movie) => movie.id)).toEqual(["movie-a", "movie-b"]);
    expect(await getMovieDetail("movie-a", "user-2")).toBeNull();
    expect(await getMediaFile("file-a", "user-2")).toBeUndefined();
  });

  test("returns detail only for playable movie items", async () => {
    expect(await getMovieDetail("movie-a", "user-1")).toMatchObject({
      movie: {
        id: "movie-a",
        title: "Alpha",
      },
      files: [
        {
          id: "file-a-alt",
        },
        {
          id: "file-a",
        },
      ],
    });
    expect(await getMovieDetail("metadata-only", "user-1")).toBeNull();
    expect(await getMovieDetail("show-a", "user-1")).toBeNull();
  });

  test("returns streamable files only for movie items", async () => {
    expect(await getMediaFile("file-a", "user-1")).toMatchObject({
      id: "file-a",
      media_item_id: "movie-a",
      title: "Alpha",
    });
    expect(await getMediaFile("file-show-a", "user-1")).toBeUndefined();
  });
});
