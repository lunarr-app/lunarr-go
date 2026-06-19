import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { load } from "./+layout.server";

type AuthLayoutData = {
  authBackgroundPosters: string[];
};

describe("auth layout server", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-auth-layout-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("loads auth background posters", async () => {
    const data = (await load({} as never)) as AuthLayoutData;
    expect(Array.isArray(data.authBackgroundPosters)).toBe(true);
  });

  test("includes poster grid when library has enough artwork", async () => {
    const db = await getDb();
    const now = new Date().toISOString();

    await db
      .insertInto("library")
      .values({
        id: "library-1",
        name: "Media",
        kind: "movie",
        path: tempDir,
        access_mode: "all",
        created_at: now,
        updated_at: now,
      })
      .execute();

    const movies = Array.from({ length: 8 }, (_, index) => ({
      id: `movie-${index + 1}`,
      kind: "movie" as const,
      title: `Movie ${index + 1}`,
      sort_title: `movie ${index + 1}`,
      year: 2024,
      poster_path: `/movie-${index + 1}.jpg`,
      release_date: "2024-01-01",
      provider: null,
      provider_id: null,
      parent_id: null,
      created_at: now,
      updated_at: now,
    }));

    await db.insertInto("media_item").values(movies).execute();
    await db
      .insertInto("media_file")
      .values(
        movies.map((movie, index) => ({
          id: `file-${index + 1}`,
          library_id: "library-1",
          media_item_id: movie.id,
          path: path.join(tempDir, `${movie.id}.mp4`),
          basename: `${movie.id}.mp4`,
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: Date.now(),
          duration_seconds: 100,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        })),
      )
      .execute();

    const data = (await load({} as never)) as AuthLayoutData;
    expect(data.authBackgroundPosters.length).toBeGreaterThan(0);
  });
});
