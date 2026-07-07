import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { introDbLookupForMediaItem } from "./index";

describe("introDb lookup", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-introdb-lookup-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();

    const now = new Date().toISOString();
    const db = await getDb();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "movie-1",
          kind: "movie",
          title: "Matrix",
          sort_title: "matrix",
          year: 1999,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "1999-01-01",
          imdb_id: "tt0133093",
          provider: "tmdb",
          provider_id: "603",
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "show-1",
          kind: "show",
          title: "Breaking Bad",
          sort_title: "breaking bad",
          year: 2008,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2008-01-01",
          imdb_id: "tt0903747",
          provider: "tmdb",
          provider_id: "1396",
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "show-2",
          kind: "show",
          title: "Legacy Show",
          sort_title: "legacy show",
          year: 2000,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2000-01-01",
          imdb_id: "tt0903747",
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
          sort_title: "0001",
          year: null,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: null,
          season_number: 1,
          provider: null,
          provider_id: null,
          parent_id: "show-1",
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "season-2",
          kind: "season",
          title: "Season 1",
          sort_title: "0001",
          year: null,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: null,
          season_number: 1,
          provider: null,
          provider_id: null,
          parent_id: "show-2",
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "episode-1",
          kind: "episode",
          title: "Pilot",
          sort_title: "s001e0001",
          year: null,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: null,
          season_number: 1,
          episode_number: 1,
          provider: null,
          provider_id: null,
          parent_id: "season-1",
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "episode-2",
          kind: "episode",
          title: "Legacy Pilot",
          sort_title: "s001e0001",
          year: null,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: null,
          season_number: 1,
          episode_number: 1,
          provider: null,
          provider_id: null,
          parent_id: "season-2",
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests?.();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("prefers movie TMDb ids for lookup", async () => {
    await expect(introDbLookupForMediaItem("movie-1")).resolves.toEqual({
      tmdbId: 603,
    });
  });

  test("prefers show TMDb ids for episode lookup", async () => {
    await expect(introDbLookupForMediaItem("episode-1")).resolves.toEqual({
      tmdbId: 1396,
      season: 1,
      episode: 1,
    });
  });

  test("returns null when show TMDb metadata is missing", async () => {
    await expect(introDbLookupForMediaItem("episode-2")).resolves.toBeNull();
  });
});
