import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { createLibrary } from "../libraries";
import { createScanJob, runScanJob } from "../scanner";
import { fixMovieMatch, fixShowMatch, revertFixMatch } from "./fix-match";
import { refreshMovieMetadataResult } from "./movies";
import { refreshTvShowMetadataResult } from "./tv";
import { clearTmdbDetailCachesForTests, type MatchedMovieMetadata, type MatchedTvSeasonLookup } from "./tmdb";

let tempDir: string;
let extraDirs: string[];
let db: Kysely<Database>;

const now = () => new Date().toISOString();

function movieDetailJson(id: number, title: string, releaseDate: string) {
  return {
    id,
    title,
    overview: `${title} overview.`,
    release_date: releaseDate,
    runtime: 136,
    poster_path: `/${id}.jpg`,
    backdrop_path: `/${id}-backdrop.jpg`,
    popularity: 50,
    vote_average: 7.5,
    vote_count: 500,
  };
}

function tvShowDetailJson(id: number, name: string, firstAirDate: string) {
  return {
    id,
    name,
    original_name: name,
    overview: `${name} overview.`,
    first_air_date: firstAirDate,
    poster_path: `/${id}.jpg`,
    backdrop_path: `/${id}-backdrop.jpg`,
    popularity: 60,
    vote_average: 8,
    vote_count: 700,
    status: "Ended",
    external_ids: { imdb_id: `tt${id}` },
  };
}

function tvSeasonJson(showTmdbId: number, seasonNumber: number, episodeCount: number) {
  return {
    id: showTmdbId * 10 + seasonNumber,
    name: seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`,
    season_number: seasonNumber,
    air_date: "2008-01-20",
    episodes: Array.from({ length: episodeCount }, (_, index) => ({
      id: showTmdbId * 1000 + seasonNumber * 100 + index + 1,
      name: `Episode ${index + 1}`,
      season_number: seasonNumber,
      episode_number: index + 1,
      air_date: "2008-01-20",
      runtime: 47,
    })),
  };
}

async function seedUser(userId: string) {
  await db
    .insertInto("user")
    .values({
      id: userId,
      name: "Admin",
      email: `${userId}@example.com`,
      role: "admin",
      email_verified: 0,
      image: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    })
    .execute();
}

beforeEach(async () => {
  clearTmdbDetailCachesForTests();
  extraDirs = [];
  tempDir = await realpath(await mkdtemp(path.join(tmpdir(), "lunarr-fix-match-")));

  await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
  await migrateDatabase();
  db = await getDb();

  const timestamp = now();
  await db
    .insertInto("library")
    .values({
      id: "library-1",
      name: "Movies",
      kind: "movie",
      path: tempDir,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .execute();
  await db
    .insertInto("media_item")
    .values({
      id: "movie-1",
      kind: "movie",
      title: "Local Title",
      sort_title: "local title",
      year: 1999,
      overview: null,
      runtime_seconds: null,
      poster_path: null,
      backdrop_path: null,
      release_date: "1999-01-01",
      provider: null,
      provider_id: null,
      parent_id: null,
      popularity: null,
      vote_average: null,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .execute();
  await db
    .insertInto("media_file")
    .values({
      id: "file-1",
      library_id: "library-1",
      media_item_id: "movie-1",
      path: path.join(tempDir, "The.Matrix.1999.mkv"),
      basename: "The.Matrix.1999.mkv",
      extension: ".mkv",
      size_bytes: 10,
      mtime_ms: Date.now(),
      duration_seconds: null,
      video_codec: null,
      audio_codec: null,
      container: "mkv",
      created_at: timestamp,
      updated_at: timestamp,
    })
    .execute();
});

afterEach(async () => {
  await closeDatabaseForTests();
  await rm(tempDir, { recursive: true, force: true });
  for (const dir of extraDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function scanRootDir(name: string) {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), `lunarr-fix-match-${name}-`)));
  extraDirs.push(dir);
  return dir;
}

describe("fixMovieMatch", () => {
  test("updates an unmatched movie in place and flags it as manually matched", async () => {
    const mockedFetch = async (input: URL | RequestInfo): Promise<Response> => {
      expect(String(input)).toContain("/movie/603");
      return Response.json(movieDetailJson(603, "The Matrix", "1999-03-31"));
    };

    const result = await fixMovieMatch("movie-1", 603, { fetch: mockedFetch as typeof fetch });

    expect(result).toEqual({ status: "matched", mediaItemId: "movie-1" });
    const movie = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-1").executeTakeFirstOrThrow();
    expect(movie).toMatchObject({
      title: "The Matrix",
      sort_title: "matrix",
      provider: "tmdb",
      provider_id: "603",
      poster_path: "/603.jpg",
      manual_match: 1,
    });
    expect(
      await db.selectFrom("media_file").select("media_item_id").where("id", "=", "file-1").executeTakeFirstOrThrow(),
    ).toMatchObject({ media_item_id: "movie-1" });
  });

  test("merges into an existing provider item and moves files, progress, watchlist, and shares", async () => {
    const timestamp = now();
    await seedUser("user-1");
    await seedUser("user-2");
    await db
      .insertInto("media_item")
      .values({
        id: "movie-2",
        kind: "movie",
        title: "The Matrix",
        sort_title: "matrix",
        year: 1999,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "1999-03-31",
        provider: "tmdb",
        provider_id: "603",
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
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
        updated_at: timestamp,
      })
      .execute();
    await db
      .insertInto("watchlist")
      .values([
        { user_id: "user-1", media_item_id: "movie-1", created_at: timestamp },
        { user_id: "user-2", media_item_id: "movie-1", created_at: timestamp },
        { user_id: "user-2", media_item_id: "movie-2", created_at: timestamp },
      ])
      .execute();
    await db
      .insertInto("media_share")
      .values({
        id: "share-1",
        token: "share-token-1",
        created_by_user_id: "user-1",
        kind: "movie",
        media_item_id: "movie-1",
        season_ids: null,
        expires_at: "2027-01-01T00:00:00.000Z",
        revoked_at: null,
        created_at: timestamp,
      })
      .execute();

    const mockedFetch = async (_input: URL | RequestInfo) =>
      Response.json(movieDetailJson(603, "The Matrix", "1999-03-31"));
    const result = await fixMovieMatch("movie-1", 603, { fetch: mockedFetch as typeof fetch });

    expect(result).toEqual({ status: "matched", mediaItemId: "movie-2" });
    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "movie-1").executeTakeFirst(),
    ).toBeUndefined();
    const target = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-2").executeTakeFirstOrThrow();
    expect(target).toMatchObject({ provider_id: "603", manual_match: 1 });
    expect(
      await db.selectFrom("media_file").select("media_item_id").where("id", "=", "file-1").executeTakeFirstOrThrow(),
    ).toMatchObject({ media_item_id: "movie-2" });
    expect(
      await db
        .selectFrom("watch_progress")
        .select(["media_item_id", "position_seconds"])
        .where("user_id", "=", "user-1")
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ media_item_id: "movie-2", position_seconds: 120 });
    expect(await db.selectFrom("watchlist").select(["user_id", "media_item_id"]).orderBy("user_id").execute()).toEqual([
      { user_id: "user-1", media_item_id: "movie-2" },
      { user_id: "user-2", media_item_id: "movie-2" },
    ]);
    expect(
      await db.selectFrom("media_share").select(["id", "token", "media_item_id"]).executeTakeFirstOrThrow(),
    ).toEqual({ id: "share-1", token: "share-token-1", media_item_id: "movie-2" });
  });

  test("reports missing items and unknown TMDb IDs", async () => {
    const mockedFetch = async (_input: URL | RequestInfo) => new Response("{}", { status: 404 });

    expect(await fixMovieMatch("unknown", 603, { fetch: mockedFetch as typeof fetch })).toEqual({
      status: "missing",
      mediaItemId: null,
    });
    expect(await fixMovieMatch("movie-1", 999999999, { fetch: mockedFetch as typeof fetch })).toEqual({
      status: "not_found",
      mediaItemId: "movie-1",
    });
  });
});

async function seedShowTree() {
  const timestamp = now();
  await db
    .insertInto("media_item")
    .values([
      {
        id: "show-1",
        kind: "show",
        title: "Local Show",
        sort_title: "local show",
        year: 2008,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: null,
        provider: null,
        provider_id: null,
        manual_match: 0,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
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
        episode_number: null,
        provider: null,
        provider_id: null,
        manual_match: 0,
        parent_id: "show-1",
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: "episode-1",
        kind: "episode",
        title: "Episode 1",
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
        manual_match: 0,
        parent_id: "season-1",
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ])
    .execute();
  await db
    .insertInto("media_file")
    .values({
      id: "file-tv-1",
      library_id: "library-1",
      media_item_id: "episode-1",
      path: path.join(tempDir, "Local Show", "Season 01", "Local Show - S01E01.mkv"),
      basename: "Local Show - S01E01.mkv",
      extension: ".mkv",
      size_bytes: 10,
      mtime_ms: Date.now(),
      duration_seconds: null,
      video_codec: null,
      audio_codec: null,
      container: "mkv",
      created_at: timestamp,
      updated_at: timestamp,
    })
    .execute();
}

describe("fixShowMatch", () => {
  test("applies show, season, and episode metadata and flags the show as manually matched", async () => {
    await seedShowTree();
    const calls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/tv/1396/season/1")) return Response.json(tvSeasonJson(1396, 1, 2));
      if (url.includes("/tv/1396")) return Response.json(tvShowDetailJson(1396, "Breaking Bad", "2008-01-20"));
      return new Response("{}", { status: 404 });
    };

    const result = await fixShowMatch("show-1", 1396, { fetch: mockedFetch as typeof fetch });

    expect(result).toMatchObject({ status: "matched", mediaItemId: "show-1", matchedSeasons: 1, addedEpisodes: 1 });
    expect(calls.every((url) => !url.includes("/search/tv"))).toBe(true);

    const show = await db.selectFrom("media_item").selectAll().where("id", "=", "show-1").executeTakeFirstOrThrow();
    expect(show).toMatchObject({
      title: "Breaking Bad",
      provider: "tmdb",
      provider_id: "1396",
      manual_match: 1,
    });

    const season = await db.selectFrom("media_item").selectAll().where("id", "=", "season-1").executeTakeFirstOrThrow();
    expect(season).toMatchObject({ provider: "tmdb", provider_id: "13961", parent_id: "show-1" });

    const episodes = await db
      .selectFrom("media_item")
      .selectAll()
      .where("parent_id", "=", "season-1")
      .orderBy("episode_number", "asc")
      .execute();
    expect(episodes).toHaveLength(2);
    expect(episodes[0]).toMatchObject({ id: "episode-1", provider_id: "1396101", episode_number: 1 });
    expect(episodes[1]).toMatchObject({ provider_id: "1396102", episode_number: 2 });

    expect(
      await db.selectFrom("media_file").select("media_item_id").where("id", "=", "file-tv-1").executeTakeFirstOrThrow(),
    ).toMatchObject({ media_item_id: "episode-1" });
  });

  test("rejects when a local season does not exist on the target TMDb show", async () => {
    await seedShowTree();
    const timestamp = now();
    await db
      .insertInto("media_item")
      .values({
        id: "season-9",
        kind: "season",
        title: "Season 9",
        sort_title: "0009",
        year: null,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: null,
        season_number: 9,
        episode_number: null,
        provider: "tmdb",
        provider_id: "5559",
        parent_id: "show-1",
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();

    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/tv/1396/season/1")) return Response.json(tvSeasonJson(1396, 1, 1));
      if (url.includes("/tv/1396/season/")) return new Response("{}", { status: 404 });
      if (url.includes("/tv/1396")) return Response.json(tvShowDetailJson(1396, "Breaking Bad", "2008-01-20"));
      return new Response("{}", { status: 404 });
    };

    const result = await fixShowMatch("show-1", 1396, { fetch: mockedFetch as typeof fetch });

    expect(result).toMatchObject({ status: "missing_seasons", mediaItemId: "show-1", missingSeasons: [9] });

    const show = await db.selectFrom("media_item").selectAll().where("id", "=", "show-1").executeTakeFirstOrThrow();
    expect(show).toMatchObject({ provider: null, provider_id: null, manual_match: 0 });
    const season = await db.selectFrom("media_item").selectAll().where("id", "=", "season-1").executeTakeFirstOrThrow();
    expect(season).toMatchObject({ provider: null, provider_id: null });
    const orphanSeason = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", "season-9")
      .executeTakeFirstOrThrow();
    expect(orphanSeason).toMatchObject({ provider: "tmdb", provider_id: "5559" });
  });

  test("merges into an existing provider show and moves watchlist, shares, and season references", async () => {
    const timestamp = now();
    await seedUser("user-1");
    await db
      .insertInto("media_item")
      .values([
        {
          id: "show-target",
          kind: "show",
          title: "Breaking Bad",
          sort_title: "breaking bad",
          year: 2008,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2008-01-20",
          provider: "tmdb",
          provider_id: "1396",
          manual_match: 0,
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: timestamp,
          updated_at: timestamp,
        },
        {
          id: "season-target",
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
          episode_number: null,
          provider: "tmdb",
          provider_id: "13961",
          manual_match: 0,
          parent_id: "show-target",
          popularity: null,
          vote_average: null,
          created_at: timestamp,
          updated_at: timestamp,
        },
      ])
      .execute();
    await seedShowTree();
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "555" })
      .where("id", "=", "show-1")
      .execute();
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "5551" })
      .where("id", "=", "season-1")
      .execute();
    await db
      .insertInto("watchlist")
      .values({ user_id: "user-1", media_item_id: "show-1", created_at: timestamp })
      .execute();
    await db
      .insertInto("media_share")
      .values({
        id: "share-tv",
        token: "share-token-tv",
        created_by_user_id: "user-1",
        kind: "show",
        media_item_id: "show-1",
        season_ids: JSON.stringify(["season-1"]),
        expires_at: "2027-01-01T00:00:00.000Z",
        revoked_at: null,
        created_at: timestamp,
      })
      .execute();

    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/tv/1396/season/1")) return Response.json(tvSeasonJson(1396, 1, 1));
      if (url.includes("/tv/1396")) return Response.json(tvShowDetailJson(1396, "Breaking Bad", "2008-01-20"));
      return new Response("{}", { status: 404 });
    };

    const result = await fixShowMatch("show-1", 1396, { fetch: mockedFetch as typeof fetch });

    expect(result).toMatchObject({ status: "matched", mediaItemId: "show-target", matchedSeasons: 1 });
    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "show-1").executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "season-1").executeTakeFirst(),
    ).toBeUndefined();
    const target = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", "show-target")
      .executeTakeFirstOrThrow();
    expect(target).toMatchObject({ provider_id: "1396", manual_match: 1 });
    expect(await db.selectFrom("watchlist").select(["user_id", "media_item_id"]).executeTakeFirstOrThrow()).toEqual({
      user_id: "user-1",
      media_item_id: "show-target",
    });
    expect(
      await db.selectFrom("media_share").select(["media_item_id", "season_ids"]).executeTakeFirstOrThrow(),
    ).toEqual({ media_item_id: "show-target", season_ids: JSON.stringify(["season-target"]) });

    const file = await db
      .selectFrom("media_file")
      .select("media_item_id")
      .where("id", "=", "file-tv-1")
      .executeTakeFirstOrThrow();
    const episode = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", file!.media_item_id)
      .executeTakeFirstOrThrow();
    const season = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", episode!.parent_id!)
      .executeTakeFirstOrThrow();
    expect(season).toMatchObject({ id: "season-target", parent_id: "show-target" });
  });

  test("reports shows without seasons, unknown shows, and unknown TMDb IDs", async () => {
    const notFoundFetch = async (_input: URL | RequestInfo) => new Response("{}", { status: 404 });

    expect(await fixShowMatch("unknown", 1396, { fetch: notFoundFetch as typeof fetch })).toEqual({
      status: "missing",
      mediaItemId: null,
    });

    const timestamp = now();
    await db
      .insertInto("media_item")
      .values({
        id: "show-empty",
        kind: "show",
        title: "Empty Show",
        sort_title: "empty show",
        year: null,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: null,
        provider: null,
        provider_id: null,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    expect(await fixShowMatch("show-empty", 1396, { fetch: notFoundFetch as typeof fetch })).toEqual({
      status: "no_seasons",
      mediaItemId: "show-empty",
    });

    await seedShowTree();
    expect(await fixShowMatch("show-1", 999999999, { fetch: notFoundFetch as typeof fetch })).toEqual({
      status: "not_found",
      mediaItemId: "show-1",
    });
  });
});

describe("manual match durability on refresh", () => {
  test("refreshing a manually matched movie uses the pinned TMDb ID instead of the filename", async () => {
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "603", manual_match: 1, title: "Wrong Title" })
      .where("id", "=", "movie-1")
      .execute();

    const pathMatcherCalls: Array<{ title: string; year: number | null }> = [];
    const pathMatcher = async (title: string, year: number | null): Promise<MatchedMovieMetadata | null> => {
      pathMatcherCalls.push({ title, year });
      return {
        provider: "tmdb",
        providerId: "777",
        title: "Wrong Movie",
        year,
        overview: null,
        runtimeSeconds: null,
        posterPath: null,
        backdropPath: null,
        releaseDate: null,
        popularity: null,
        voteAverage: null,
      };
    };
    const byIdCalls: number[] = [];
    const byIdMatcher = async (tmdbId: number): Promise<MatchedMovieMetadata | null> => {
      byIdCalls.push(tmdbId);
      return {
        provider: "tmdb",
        providerId: "603",
        title: "The Matrix",
        year: 1999,
        overview: "A hacker discovers the nature of reality.",
        runtimeSeconds: 8160,
        posterPath: "/matrix.jpg",
        backdropPath: null,
        releaseDate: "1999-03-31",
        popularity: 100,
        voteAverage: 8.3,
      };
    };

    const result = await refreshMovieMetadataResult("movie-1", {
      metadataMatcher: pathMatcher,
      metadataByIdMatcher: byIdMatcher,
    });

    expect(result).toEqual({ status: "matched", mediaItemId: "movie-1" });
    expect(byIdCalls).toEqual([603]);
    expect(pathMatcherCalls).toEqual([]);
    const movie = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-1").executeTakeFirstOrThrow();
    expect(movie).toMatchObject({
      title: "The Matrix",
      provider_id: "603",
      manual_match: 1,
    });
  });

  test("refreshing a manually matched show uses the pinned TMDb ID instead of the title", async () => {
    const timestamp = now();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "show-1",
          kind: "show",
          title: "Wrong Show",
          sort_title: "wrong show",
          year: 2008,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: null,
          provider: "tmdb",
          provider_id: "1396",
          manual_match: 1,
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: timestamp,
          updated_at: timestamp,
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
          episode_number: null,
          provider: null,
          provider_id: null,
          manual_match: 0,
          parent_id: "show-1",
          popularity: null,
          vote_average: null,
          created_at: timestamp,
          updated_at: timestamp,
        },
      ])
      .execute();

    const titleMatcherCalls: string[] = [];
    const titleMatcher = async (): Promise<MatchedTvSeasonLookup | null> => {
      titleMatcherCalls.push("called");
      return null;
    };
    const byIdCalls: Array<{ tmdbId: number; seasonNumber: number }> = [];
    const byIdMatcher = async (tmdbId: number, seasonNumber: number): Promise<MatchedTvSeasonLookup | null> => {
      byIdCalls.push({ tmdbId, seasonNumber });
      return {
        show: {
          provider: "tmdb",
          providerId: "1396",
          title: "Breaking Bad",
          year: 2008,
          overview: "A chemistry teacher turns meth maker.",
          posterPath: "/bb.jpg",
          backdropPath: null,
          firstAirDate: "2008-01-20",
          popularity: 90,
          voteAverage: 8.9,
          voteCount: 100,
          originalTitle: null,
          tagline: null,
          status: "Ended",
          homepage: null,
          originalLanguage: "en",
          imdbId: null,
          certification: null,
          trailer: null,
        },
        season: {
          provider: "tmdb",
          providerId: "3572",
          title: "Season 1",
          seasonNumber: 1,
          overview: null,
          posterPath: null,
          airDate: "2008-01-20",
          voteAverage: null,
        },
        episodes: [],
      };
    };

    const result = await refreshTvShowMetadataResult("show-1", {
      metadataMatcher: titleMatcher,
      metadataByIdMatcher: byIdMatcher,
    });

    expect(result).toMatchObject({ status: "matched", mediaItemId: "show-1", matchedSeasons: 1 });
    expect(byIdCalls).toEqual([{ tmdbId: 1396, seasonNumber: 1 }]);
    expect(titleMatcherCalls).toEqual([]);
    const show = await db.selectFrom("media_item").selectAll().where("id", "=", "show-1").executeTakeFirstOrThrow();
    expect(show).toMatchObject({
      title: "Breaking Bad",
      provider_id: "1396",
      manual_match: 1,
    });
  });
});

describe("revert manual match", () => {
  test("reverting a manually matched movie clears the flag and re-matches by filename", async () => {
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "603", manual_match: 1, title: "Wrong Title" })
      .where("id", "=", "movie-1")
      .execute();

    const pathMatcherCalls: Array<{ title: string; year: number | null }> = [];
    const pathMatcher = async (title: string, year: number | null): Promise<MatchedMovieMetadata | null> => {
      pathMatcherCalls.push({ title, year });
      return {
        provider: "tmdb",
        providerId: "777",
        title: "The Matrix",
        year,
        overview: null,
        runtimeSeconds: null,
        posterPath: null,
        backdropPath: null,
        releaseDate: null,
        popularity: null,
        voteAverage: null,
      };
    };
    const byIdCalls: number[] = [];
    const byIdMatcher = async (tmdbId: number): Promise<MatchedMovieMetadata | null> => {
      byIdCalls.push(tmdbId);
      return null;
    };

    const result = await revertFixMatch("movie", "movie-1", {
      movie: { metadataMatcher: pathMatcher, metadataByIdMatcher: byIdMatcher },
    });

    expect(result).toEqual({ status: "matched", mediaItemId: "movie-1" });
    expect(pathMatcherCalls.length).toBe(1);
    expect(byIdCalls).toEqual([]);
    const movie = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-1").executeTakeFirstOrThrow();
    expect(movie).toMatchObject({ title: "The Matrix", provider_id: "777", manual_match: 0 });
  });

  test("reverting a manually matched movie that merges into another manual item clears the target flag", async () => {
    const timestamp = now();
    await db
      .insertInto("media_item")
      .values({
        id: "movie-2",
        kind: "movie",
        title: "The Matrix",
        sort_title: "matrix",
        year: 1999,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "1999-03-31",
        provider: "tmdb",
        provider_id: "777",
        manual_match: 1,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "603", manual_match: 1, title: "Wrong Title" })
      .where("id", "=", "movie-1")
      .execute();

    const result = await revertFixMatch("movie", "movie-1", {
      movie: {
        metadataMatcher: async (_title, year): Promise<MatchedMovieMetadata | null> => ({
          provider: "tmdb",
          providerId: "777",
          title: "The Matrix",
          year,
          overview: null,
          runtimeSeconds: null,
          posterPath: null,
          backdropPath: null,
          releaseDate: null,
          popularity: null,
          voteAverage: null,
        }),
      },
    });

    expect(result).toEqual({ status: "matched", mediaItemId: "movie-2" });
    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "movie-1").executeTakeFirst(),
    ).toBeUndefined();
    const target = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-2").executeTakeFirstOrThrow();
    expect(target).toMatchObject({ provider_id: "777", manual_match: 0 });
    expect(
      await db.selectFrom("media_file").select("media_item_id").where("id", "=", "file-1").executeTakeFirstOrThrow(),
    ).toMatchObject({ media_item_id: "movie-2" });
  });

  test("reverting a manually matched movie with multiple files moves every file to the merge target", async () => {
    const timestamp = now();
    await seedUser("user-1");
    await db
      .insertInto("media_item")
      .values({
        id: "movie-2",
        kind: "movie",
        title: "The Matrix",
        sort_title: "matrix",
        year: 1999,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "1999-03-31",
        provider: "tmdb",
        provider_id: "777",
        manual_match: 1,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values([
        {
          id: "file-2",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "The.Matrix.1999.CD2.mkv"),
          basename: "The.Matrix.1999.CD2.mkv",
          extension: ".mkv",
          size_bytes: 10,
          mtime_ms: Date.now(),
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mkv",
          created_at: timestamp,
          updated_at: timestamp,
        },
        {
          id: "file-3",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "The.Matrix.1999.Extras.mkv"),
          basename: "The.Matrix.1999.Extras.mkv",
          extension: ".mkv",
          size_bytes: 10,
          mtime_ms: Date.now(),
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mkv",
          created_at: timestamp,
          updated_at: timestamp,
        },
      ])
      .execute();
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-1",
        media_file_id: "file-2",
        position_seconds: 300,
        duration_seconds: 8160,
        completed: 0,
        updated_at: timestamp,
      })
      .execute();
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "603", manual_match: 1, title: "Wrong Title" })
      .where("id", "=", "movie-1")
      .execute();

    const result = await revertFixMatch("movie", "movie-1", {
      movie: {
        metadataMatcher: async (_title, year): Promise<MatchedMovieMetadata | null> => ({
          provider: "tmdb",
          providerId: "777",
          title: "The Matrix",
          year,
          overview: null,
          runtimeSeconds: null,
          posterPath: null,
          backdropPath: null,
          releaseDate: null,
          popularity: null,
          voteAverage: null,
        }),
      },
    });

    expect(result).toEqual({ status: "matched", mediaItemId: "movie-2" });
    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "movie-1").executeTakeFirst(),
    ).toBeUndefined();
    const files = await db
      .selectFrom("media_file")
      .select(["id", "media_item_id"])
      .where("media_item_id", "=", "movie-2")
      .orderBy("id", "asc")
      .execute();
    expect(files).toEqual([
      { id: "file-1", media_item_id: "movie-2" },
      { id: "file-2", media_item_id: "movie-2" },
      { id: "file-3", media_item_id: "movie-2" },
    ]);
    expect(
      await db
        .selectFrom("watch_progress")
        .select(["media_item_id", "media_file_id", "position_seconds"])
        .where("user_id", "=", "user-1")
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ media_item_id: "movie-2", media_file_id: "file-2", position_seconds: 300 });
    const target = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-2").executeTakeFirstOrThrow();
    expect(target).toMatchObject({ provider_id: "777", manual_match: 0 });
  });

  test("reverting a title that is not manually matched changes nothing", async () => {
    const result = await revertFixMatch("movie", "movie-1");
    expect(result).toEqual({ status: "not_manual", mediaItemId: "movie-1" });
    const movie = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-1").executeTakeFirstOrThrow();
    expect(movie).toMatchObject({ provider: null, provider_id: null, manual_match: 0 });
  });

  test("reverting an unknown item reports missing", async () => {
    expect(await revertFixMatch("movie", "unknown")).toEqual({ status: "missing", mediaItemId: null });
    expect(await revertFixMatch("show", "unknown")).toEqual({ status: "missing", mediaItemId: null });
  });

  test("reverting a manually matched show clears the flag and re-matches by title", async () => {
    await seedShowTree();
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "1396", manual_match: 1, title: "Wrong Show" })
      .where("id", "=", "show-1")
      .execute();

    const titleMatcherCalls: Array<{ title: string; seasonNumber: number }> = [];
    const titleMatcher = async (
      title: string,
      _year: number | null,
      seasonNumber: number,
    ): Promise<MatchedTvSeasonLookup | null> => {
      titleMatcherCalls.push({ title, seasonNumber });
      return {
        show: {
          provider: "tmdb",
          providerId: "888",
          title: "Correct Show",
          year: 2008,
          overview: null,
          posterPath: null,
          backdropPath: null,
          firstAirDate: "2008-01-20",
          popularity: null,
          voteAverage: null,
          voteCount: null,
          originalTitle: null,
          tagline: null,
          status: null,
          homepage: null,
          originalLanguage: null,
          imdbId: null,
          certification: null,
          trailer: null,
        },
        season: {
          provider: "tmdb",
          providerId: "8881",
          title: "Season 1",
          seasonNumber,
          overview: null,
          posterPath: null,
          airDate: "2008-01-20",
          voteAverage: null,
        },
        episodes: [],
      };
    };
    const byIdCalls: Array<{ tmdbId: number; seasonNumber: number }> = [];
    const byIdMatcher = async (tmdbId: number, seasonNumber: number): Promise<MatchedTvSeasonLookup | null> => {
      byIdCalls.push({ tmdbId, seasonNumber });
      return null;
    };

    const result = await revertFixMatch("show", "show-1", {
      show: { metadataMatcher: titleMatcher, metadataByIdMatcher: byIdMatcher },
    });

    expect(result).toMatchObject({ status: "matched", mediaItemId: "show-1" });
    expect(titleMatcherCalls).toEqual([{ title: "Wrong Show", seasonNumber: 1 }]);
    expect(byIdCalls).toEqual([]);
    const show = await db.selectFrom("media_item").selectAll().where("id", "=", "show-1").executeTakeFirstOrThrow();
    expect(show).toMatchObject({ title: "Correct Show", provider_id: "888", manual_match: 0 });
  });

  test("reverting a manually matched show that merges into another manual show clears the target flag", async () => {
    const timestamp = now();
    await db
      .insertInto("media_item")
      .values({
        id: "show-target",
        kind: "show",
        title: "Correct Show",
        sort_title: "correct show",
        year: 2008,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2008-01-20",
        provider: "tmdb",
        provider_id: "888",
        manual_match: 1,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await seedShowTree();
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "1396", manual_match: 1, title: "Wrong Show" })
      .where("id", "=", "show-1")
      .execute();

    const result = await revertFixMatch("show", "show-1", {
      show: {
        metadataMatcher: async (_title, _year, seasonNumber): Promise<MatchedTvSeasonLookup | null> => ({
          show: {
            provider: "tmdb",
            providerId: "888",
            title: "Correct Show",
            year: 2008,
            overview: null,
            posterPath: null,
            backdropPath: null,
            firstAirDate: "2008-01-20",
            popularity: null,
            voteAverage: null,
            voteCount: null,
            originalTitle: null,
            tagline: null,
            status: null,
            homepage: null,
            originalLanguage: null,
            imdbId: null,
            certification: null,
            trailer: null,
          },
          season: {
            provider: "tmdb",
            providerId: "8881",
            title: "Season 1",
            seasonNumber,
            overview: null,
            posterPath: null,
            airDate: "2008-01-20",
            voteAverage: null,
          },
          episodes: [],
        }),
      },
    });

    expect(result).toMatchObject({ status: "matched", mediaItemId: "show-target" });
    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "show-1").executeTakeFirst(),
    ).toBeUndefined();
    const target = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", "show-target")
      .executeTakeFirstOrThrow();
    expect(target).toMatchObject({ provider_id: "888", manual_match: 0 });
  });

  test("reverting a multi-season show merges every season into the manual target and clears its flag", async () => {
    const timestamp = now();
    await db
      .insertInto("media_item")
      .values({
        id: "show-target",
        kind: "show",
        title: "Correct Show",
        sort_title: "correct show",
        year: 2008,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2008-01-20",
        provider: "tmdb",
        provider_id: "888",
        manual_match: 1,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await seedShowTree();
    await db
      .insertInto("media_item")
      .values({
        id: "season-2",
        kind: "season",
        title: "Season 2",
        sort_title: "0002",
        year: null,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: null,
        season_number: 2,
        episode_number: null,
        provider: null,
        provider_id: null,
        manual_match: 0,
        parent_id: "show-1",
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "1396", manual_match: 1, title: "Wrong Show" })
      .where("id", "=", "show-1")
      .execute();

    const result = await revertFixMatch("show", "show-1", {
      show: {
        metadataMatcher: async (_title, _year, seasonNumber): Promise<MatchedTvSeasonLookup | null> => ({
          show: {
            provider: "tmdb",
            providerId: "888",
            title: "Correct Show",
            year: 2008,
            overview: null,
            posterPath: null,
            backdropPath: null,
            firstAirDate: "2008-01-20",
            popularity: null,
            voteAverage: null,
            voteCount: null,
            originalTitle: null,
            tagline: null,
            status: null,
            homepage: null,
            originalLanguage: null,
            imdbId: null,
            certification: null,
            trailer: null,
          },
          season: {
            provider: "tmdb",
            providerId: `888${seasonNumber}`,
            title: "Season 1",
            seasonNumber,
            overview: null,
            posterPath: null,
            airDate: "2008-01-20",
            voteAverage: null,
          },
          episodes: [],
        }),
        metadataByIdMatcher: async (_tmdbId, seasonNumber): Promise<MatchedTvSeasonLookup | null> => ({
          show: {
            provider: "tmdb",
            providerId: "888",
            title: "Correct Show",
            year: 2008,
            overview: null,
            posterPath: null,
            backdropPath: null,
            firstAirDate: "2008-01-20",
            popularity: null,
            voteAverage: null,
            voteCount: null,
            originalTitle: null,
            tagline: null,
            status: null,
            homepage: null,
            originalLanguage: null,
            imdbId: null,
            certification: null,
            trailer: null,
          },
          season: {
            provider: "tmdb",
            providerId: `888${seasonNumber}`,
            title: "Season 1",
            seasonNumber,
            overview: null,
            posterPath: null,
            airDate: "2008-01-20",
            voteAverage: null,
          },
          episodes: [],
        }),
      },
    });

    expect(result).toMatchObject({ status: "matched", mediaItemId: "show-target" });
    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "show-1").executeTakeFirst(),
    ).toBeUndefined();
    const seasons = await db
      .selectFrom("media_item")
      .select(["id", "parent_id"])
      .where("kind", "=", "season")
      .orderBy("season_number", "asc")
      .execute();
    expect(seasons).toEqual([
      { id: "season-1", parent_id: "show-target" },
      { id: "season-2", parent_id: "show-target" },
    ]);
    const target = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", "show-target")
      .executeTakeFirstOrThrow();
    expect(target).toMatchObject({ provider_id: "888", manual_match: 0 });
  });

  test("reverting a manually matched show without seasons clears the flag and reports no seasons", async () => {
    const timestamp = now();
    await db
      .insertInto("media_item")
      .values({
        id: "show-empty",
        kind: "show",
        title: "Empty Show",
        sort_title: "empty show",
        year: null,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: null,
        provider: "tmdb",
        provider_id: "555",
        manual_match: 1,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();

    const result = await revertFixMatch("show", "show-empty");

    expect(result).toEqual({ status: "no_seasons", mediaItemId: "show-empty" });
    const show = await db.selectFrom("media_item").selectAll().where("id", "=", "show-empty").executeTakeFirstOrThrow();
    expect(show).toMatchObject({ manual_match: 0 });
  });

  test("reverting a manually matched movie whose filename no longer matches clears the flag anyway", async () => {
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "603", manual_match: 1 })
      .where("id", "=", "movie-1")
      .execute();

    const result = await revertFixMatch("movie", "movie-1", {
      movie: { metadataMatcher: async () => null },
    });

    expect(result).toEqual({ status: "unmatched", mediaItemId: "movie-1" });
    const movie = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-1").executeTakeFirstOrThrow();
    expect(movie).toMatchObject({ manual_match: 0, provider_id: "603" });
  });

  test("reverting a manually matched movie without files clears the flag and reports unmatched", async () => {
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "603", manual_match: 1 })
      .where("id", "=", "movie-1")
      .execute();
    await db.deleteFrom("media_file").where("id", "=", "file-1").execute();

    const result = await revertFixMatch("movie", "movie-1");

    expect(result).toEqual({ status: "unmatched", mediaItemId: "movie-1" });
    const movie = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-1").executeTakeFirstOrThrow();
    expect(movie).toMatchObject({ manual_match: 0, provider_id: "603" });
  });

  test("reverting a manually matched show whose title no longer matches clears the flag anyway", async () => {
    await seedShowTree();
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "1396", manual_match: 1 })
      .where("id", "=", "show-1")
      .execute();

    const result = await revertFixMatch("show", "show-1", {
      show: { metadataMatcher: async () => null },
    });

    expect(result).toEqual({ status: "unmatched", mediaItemId: "show-1" });
    const show = await db.selectFrom("media_item").selectAll().where("id", "=", "show-1").executeTakeFirstOrThrow();
    expect(show).toMatchObject({ manual_match: 0, provider_id: "1396" });
  });
});

describe("manual match durability on library scans", () => {
  test("rescans keep manually matched movies even when filenames point elsewhere", async () => {
    const moviesDir = path.join(await scanRootDir("scan-movies"), "movies");
    await mkdir(moviesDir, { recursive: true });
    const filePath = path.join(moviesDir, "Some.Movie.2020.mkv");
    await writeFile(filePath, "original");
    const scanLibrary = await createLibrary({ name: "Scan Movies", kind: "movie", path: moviesDir });

    const wrongMatcher = async (title: string, year: number | null): Promise<MatchedMovieMetadata | null> => {
      if (title !== "Some Movie") return null;
      return {
        provider: "tmdb",
        providerId: "555",
        title,
        year,
        overview: null,
        runtimeSeconds: null,
        posterPath: null,
        backdropPath: null,
        releaseDate: null,
        popularity: null,
        voteAverage: null,
      };
    };

    const firstJobId = await createScanJob(scanLibrary.id);
    await runScanJob(firstJobId, { metadataMatcher: wrongMatcher });
    const wrongItem = await db
      .selectFrom("media_item")
      .selectAll()
      .where("provider_id", "=", "555")
      .executeTakeFirstOrThrow();

    const mockedFetch = async (_input: URL | RequestInfo) =>
      Response.json(movieDetailJson(603, "The Matrix", "1999-03-31"));
    const fixed = await fixMovieMatch(wrongItem.id, 603, { fetch: mockedFetch as typeof fetch });
    expect(fixed.status).toBe("matched");

    await appendFile(filePath, "-extra-bytes");

    let matcherCalls = 0;
    const countingMatcher = async (title: string, year: number | null) => {
      matcherCalls += 1;
      return wrongMatcher(title, year);
    };
    const secondJobId = await createScanJob(scanLibrary.id);
    await runScanJob(secondJobId, { metadataMatcher: countingMatcher });

    expect(matcherCalls).toBe(0);
    const file = await db
      .selectFrom("media_file")
      .select("media_item_id")
      .where("path", "=", filePath)
      .executeTakeFirstOrThrow();
    expect(file.media_item_id).toBe(wrongItem.id);
    const item = await db.selectFrom("media_item").selectAll().where("id", "=", wrongItem.id).executeTakeFirstOrThrow();
    expect(item).toMatchObject({ provider_id: "603", title: "The Matrix", manual_match: 1 });
  });

  test("rescans keep manually matched shows even when filenames point elsewhere", async () => {
    const showsDir = path.join(await scanRootDir("scan-shows"), "shows");
    const seasonDir = path.join(showsDir, "Local Show", "Season 01");
    await mkdir(seasonDir, { recursive: true });
    const filePath = path.join(seasonDir, "Local Show - S01E01.mkv");
    await writeFile(filePath, "original");
    const scanLibrary = await createLibrary({ name: "Scan Shows", kind: "tv", path: showsDir });

    const wrongLookup: MatchedTvSeasonLookup = {
      show: {
        provider: "tmdb",
        providerId: "555",
        title: "Wrong Show",
        year: 2020,
        overview: null,
        posterPath: null,
        backdropPath: null,
        firstAirDate: "2020-01-01",
        popularity: null,
        voteAverage: null,
        voteCount: null,
        originalTitle: null,
        tagline: null,
        status: null,
        homepage: null,
        originalLanguage: null,
        imdbId: null,
        certification: null,
        trailer: null,
      },
      season: {
        provider: "tmdb",
        providerId: "5551",
        title: "Season 1",
        seasonNumber: 1,
        overview: null,
        posterPath: null,
        airDate: null,
        voteAverage: null,
      },
      episodes: [
        {
          provider: "tmdb",
          providerId: "55511",
          title: "Episode 1",
          seasonNumber: 1,
          episodeNumber: 1,
          overview: null,
          stillPath: null,
          airDate: null,
          runtimeSeconds: null,
          voteAverage: null,
          voteCount: null,
        },
      ],
    };
    const wrongMatcher = async (): Promise<MatchedTvSeasonLookup | null> => wrongLookup;

    const firstJobId = await createScanJob(scanLibrary.id);
    await runScanJob(firstJobId, { tvSeasonMetadataMatcher: wrongMatcher });
    const wrongShow = await db
      .selectFrom("media_item")
      .selectAll()
      .where("kind", "=", "show")
      .where("provider_id", "=", "555")
      .executeTakeFirstOrThrow();

    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/tv/1396/season/1")) return Response.json(tvSeasonJson(1396, 1, 1));
      if (url.includes("/tv/1396")) return Response.json(tvShowDetailJson(1396, "Breaking Bad", "2008-01-20"));
      return new Response("{}", { status: 404 });
    };
    const fixed = await fixShowMatch(wrongShow.id, 1396, { fetch: mockedFetch as typeof fetch });
    expect(fixed.status).toBe("matched");

    await appendFile(filePath, "-extra-bytes");

    let matcherCalls = 0;
    const countingMatcher = async () => {
      matcherCalls += 1;
      return wrongLookup;
    };
    const secondJobId = await createScanJob(scanLibrary.id);
    await runScanJob(secondJobId, { tvSeasonMetadataMatcher: countingMatcher });

    expect(matcherCalls).toBe(0);
    const file = await db
      .selectFrom("media_file")
      .select("media_item_id")
      .where("path", "=", filePath)
      .executeTakeFirstOrThrow();
    const episode = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", file.media_item_id)
      .executeTakeFirstOrThrow();
    expect(episode?.kind).toBe("episode");
    const season = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", episode!.parent_id!)
      .executeTakeFirstOrThrow();
    const show = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", season!.parent_id!)
      .executeTakeFirstOrThrow();
    expect(show).toMatchObject({ provider_id: "1396", title: "Breaking Bad", manual_match: 1 });
  });
});
