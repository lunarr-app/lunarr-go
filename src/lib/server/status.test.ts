import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
} from "./db";
import type { Database } from "./db/schema";
import { getServerStatus } from "./status";

describe("getServerStatus", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-status-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const now = new Date().toISOString();
    const moviesDir = path.join(tempDir, "Movies");
    const tvDir = path.join(tempDir, "TV");
    await db
      .insertInto("library")
      .values([
        {
          id: "library-1",
          name: "Movies",
          kind: "movie",
          path: moviesDir,
          created_at: now,
          updated_at: now,
        },
        {
          id: "library-2",
          name: "TV",
          kind: "tv",
          path: tvDir,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "playable-movie",
          kind: "movie",
          title: "Playable",
          sort_title: "playable",
          year: 2024,
          overview: null,
          runtime_seconds: null,
          poster_path: "/playable.jpg",
          backdrop_path: null,
          release_date: "2024-01-01",
          provider: "tmdb",
          provider_id: "1",
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "metadata-only",
          kind: "movie",
          title: "Metadata Only",
          sort_title: "metadata only",
          year: 2025,
          overview: null,
          runtime_seconds: null,
          poster_path: "/orphan.jpg",
          backdrop_path: null,
          release_date: "2025-01-01",
          provider: "tmdb",
          provider_id: "2",
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "playable-show",
          kind: "show",
          title: "Playable Show",
          sort_title: "playable show",
          year: 2024,
          overview: null,
          runtime_seconds: null,
          poster_path: "/show.jpg",
          backdrop_path: null,
          release_date: "2024-01-01",
          provider: "tmdb",
          provider_id: "100",
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
          sort_title: "0001",
          year: 2024,
          season_number: 1,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2024-01-01",
          provider: "tmdb",
          provider_id: "season-1",
          parent_id: "playable-show",
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "episode-1",
          kind: "episode",
          title: "Episode 1",
          sort_title: "s001e0001",
          year: 2024,
          season_number: 1,
          episode_number: 1,
          overview: null,
          runtime_seconds: null,
          poster_path: "/episode.jpg",
          backdrop_path: null,
          release_date: "2024-01-01",
          provider: "tmdb",
          provider_id: "episode-1",
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
      .values([
        {
          id: "file-1",
          library_id: "library-1",
          media_item_id: "playable-movie",
          path: path.join(tempDir, "Playable.2024.mp4"),
          basename: "Playable.2024.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: Date.now(),
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
        {
          id: "file-2",
          library_id: "library-2",
          media_item_id: "episode-1",
          path: path.join(
            tempDir,
            "Playable Show",
            "Season 01",
            "Playable.Show.S01E01.mp4",
          ),
          basename: "Playable.Show.S01E01.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: Date.now(),
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("counts only playable media for metadata totals", async () => {
    const status = await getServerStatus();

    expect(status).toMatchObject({
      movies: 1,
      shows: 1,
      episodes: 1,
      matchedMovies: 1,
      moviesWithPosters: 1,
      matchedShows: 1,
      showsWithPosters: 1,
      matchedEpisodes: 1,
      mediaFiles: 2,
    });
  });
});
