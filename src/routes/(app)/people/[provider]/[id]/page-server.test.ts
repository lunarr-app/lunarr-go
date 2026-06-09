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
  type Database,
} from "$lib/server/db";
import { load } from "./+page.server";
import { expectRejectsToMatchObject } from "$lib/test/async-expect";

type PersonPageLoadResult = {
  person: {
    provider: string;
    providerId: string;
    name: string;
    originalName: string | null;
    profileUrl: string | null;
  };
  movies: Array<{
    id: string;
    title: string;
    character: string | null;
    posterUrl: string | null;
    resumeFileId: string | null;
    progressSeconds: number;
    completed: boolean;
  }>;
  shows: Array<{
    id: string;
    title: string;
    year: number | null;
    character: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    releaseDate: string | null;
    status: string | null;
    popularity: number | null;
    voteAverage: number | null;
    episodeCount: number;
    seasonCount: number;
    latestFileCreatedAt: string | null;
    latestEpisodeReleaseDate: string | null;
  }>;
};

describe("person page server", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-person-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Person User",
        email: "person@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: nowMs,
        updated_at: nowMs,
      })
      .execute();
    await db
      .insertInto("library")
      .values([
        {
          id: "library-1",
          name: "Movies",
          kind: "movie",
          path: tempDir,
          created_at: now,
          updated_at: now,
        },
        {
          id: "library-2",
          name: "TV",
          kind: "tv",
          path: path.join(tempDir, "TV"),
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "movie-1",
          kind: "movie",
          title: "Cast Movie",
          sort_title: "cast movie",
          year: 2026,
          overview: null,
          runtime_seconds: null,
          poster_path: "/cast.jpg",
          backdrop_path: null,
          release_date: "2026-02-01",
          provider: "tmdb",
          provider_id: "movie-1",
          parent_id: null,
          popularity: 20,
          vote_average: 7.5,
          created_at: now,
          updated_at: now,
        },
        {
          id: "movie-2",
          kind: "movie",
          title: "Another Cast Movie",
          sort_title: "another cast movie",
          year: 2025,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2025-01-01",
          provider: "tmdb",
          provider_id: "movie-2",
          parent_id: null,
          popularity: 10,
          vote_average: 6,
          created_at: now,
          updated_at: now,
        },
        {
          id: "show-1",
          kind: "show",
          title: "Cast Show",
          sort_title: "cast show",
          year: 2024,
          overview: null,
          runtime_seconds: null,
          poster_path: "/show.jpg",
          backdrop_path: null,
          release_date: "2024-03-01",
          provider: "tmdb",
          provider_id: "show-1",
          parent_id: null,
          popularity: 30,
          vote_average: 8,
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
          release_date: "2024-03-01",
          provider: "tmdb",
          provider_id: "season-1",
          parent_id: "show-1",
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
          year: 2024,
          season_number: 1,
          episode_number: 1,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2024-03-02",
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
          media_item_id: "movie-1",
          path: path.join(tempDir, "Cast.Movie.2026.mp4"),
          basename: "Cast.Movie.2026.mp4",
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
          id: "file-2",
          library_id: "library-1",
          media_item_id: "movie-2",
          path: path.join(tempDir, "Another.Cast.Movie.2025.mp4"),
          basename: "Another.Cast.Movie.2025.mp4",
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
          id: "file-3",
          library_id: "library-2",
          media_item_id: "episode-1",
          path: path.join(
            tempDir,
            "TV",
            "Cast Show",
            "Season 01",
            "Cast.Show.S01E01.mp4",
          ),
          basename: "Cast.Show.S01E01.mp4",
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
      ])
      .execute();
    await db
      .insertInto("media_item_credit")
      .values([
        {
          media_item_id: "movie-1",
          credit_type: "cast",
          provider: "tmdb",
          provider_id: "person-1",
          credit_id: "credit-1",
          name: "Actor Name",
          original_name: "Actor Original",
          profile_path: "/actor.jpg",
          credit_order: 1,
          department: null,
          job: null,
          character_name: "Lead",
        },
        {
          media_item_id: "movie-2",
          credit_type: "cast",
          provider: "tmdb",
          provider_id: "person-1",
          credit_id: "credit-2",
          name: "Actor Name",
          original_name: "Actor Original",
          profile_path: "/actor.jpg",
          credit_order: 2,
          department: null,
          job: null,
          character_name: "Cameo",
        },
        {
          media_item_id: "show-1",
          credit_type: "cast",
          provider: "tmdb",
          provider_id: "person-1",
          credit_id: "credit-3",
          name: "Actor Name",
          original_name: "Actor Original",
          profile_path: "/actor.jpg",
          credit_order: 3,
          department: null,
          job: null,
          character_name: "Series Lead",
        },
      ])
      .execute();
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-1",
        media_file_id: "file-1",
        position_seconds: 30,
        duration_seconds: 100,
        completed: 0,
        updated_at: now,
      })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("loads cast details and movies featuring the person", async () => {
    const result = (await load({
      params: { provider: "tmdb", id: "person-1" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never)) as PersonPageLoadResult;

    expect(result.person).toEqual({
      provider: "tmdb",
      providerId: "person-1",
      name: "Actor Name",
      originalName: "Actor Original",
      profileUrl: "https://image.tmdb.org/t/p/w342/actor.jpg",
    });
    expect(
      result.movies.map((movie) => [movie.title, movie.character]),
    ).toEqual([
      ["Cast Movie", "Lead"],
      ["Another Cast Movie", "Cameo"],
    ]);
    expect(result.movies[0]).toMatchObject({
      id: "movie-1",
      posterUrl: "https://image.tmdb.org/t/p/w342/cast.jpg",
      resumeFileId: "file-1",
      progressSeconds: 30,
      completed: false,
    });
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0]).toMatchObject({
      id: "show-1",
      title: "Cast Show",
      year: 2024,
      posterUrl: "https://image.tmdb.org/t/p/w342/show.jpg",
      backdropUrl: null,
      releaseDate: "2024-03-01",
      status: null,
      popularity: 30,
      voteAverage: 8,
      episodeCount: 1,
      seasonCount: 1,
      latestEpisodeReleaseDate: "2024-03-02",
      character: "Series Lead",
    });
    expect(typeof result.shows[0].latestFileCreatedAt).toBe("string");
  });

  test("returns 404 for missing people", async () => {
    await expectRejectsToMatchObject(
      load({
        params: { provider: "tmdb", id: "missing" },
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      { status: 404 },
    );
  });
});
