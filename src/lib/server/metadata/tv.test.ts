import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests, type Database } from "$lib/server/db";
import { refreshTvShowMetadataResult } from "./tv";

describe("refreshTvShowMetadata", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-tv-metadata-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "show-1",
          kind: "show",
          title: "The Expanse",
          sort_title: "expanse",
          year: 2015,
          parent_id: null,
          provider: null,
          provider_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "season-1",
          kind: "season",
          title: "Season 1",
          sort_title: "0001",
          season_number: 1,
          parent_id: "show-1",
          provider: null,
          provider_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "episode-1",
          kind: "episode",
          title: "Dulcinea",
          sort_title: "s001e0001",
          season_number: 1,
          episode_number: 1,
          parent_id: "season-1",
          provider: null,
          provider_id: null,
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

  test("returns missing for unknown shows", async () => {
    expect(await refreshTvShowMetadataResult("missing")).toEqual({
      status: "missing",
      mediaItemId: null,
    });
  });

  test("returns no_seasons when a show has no seasons", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values({
        id: "show-empty",
        kind: "show",
        title: "Empty Show",
        sort_title: "empty show",
        year: 2020,
        parent_id: null,
        provider: null,
        provider_id: null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    expect(await refreshTvShowMetadataResult("show-empty")).toEqual({
      status: "no_seasons",
      mediaItemId: "show-empty",
    });
  });

  test("returns the surviving show id after provider merge", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "show-provider",
          kind: "show",
          title: "Merged Show",
          sort_title: "merged show",
          year: 2015,
          parent_id: null,
          provider: "tmdb",
          provider_id: "63639",
          created_at: now,
          updated_at: now,
        },
        {
          id: "show-local",
          kind: "show",
          title: "Merged Show",
          sort_title: "merged show",
          year: 2015,
          parent_id: null,
          provider: null,
          provider_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "season-local",
          kind: "season",
          title: "Season 1",
          sort_title: "0001",
          season_number: 1,
          parent_id: "show-local",
          provider: null,
          provider_id: null,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    const metadata = {
      show: {
        provider: "tmdb" as const,
        providerId: "63639",
        title: "Merged Show",
        year: 2015,
        originalTitle: null,
        overview: "Merged overview.",
        tagline: null,
        posterPath: "/merged.jpg",
        backdropPath: null,
        firstAirDate: "2015-12-14",
        status: "Ended",
        homepage: null,
        originalLanguage: "en",
        imdbId: null,
        popularity: 1,
        voteAverage: 8,
        voteCount: 10,
        certification: null,
        trailer: null,
        genres: [],
        cast: [],
        crew: [],
        videos: [],
        keywords: [],
        productionCompanies: [],
        productionCountries: [],
        spokenLanguages: [],
      },
      season: {
        provider: "tmdb" as const,
        providerId: "60001",
        title: "Season 1",
        seasonNumber: 1,
        overview: null,
        posterPath: null,
        airDate: "2015-12-14",
        voteAverage: null,
      },
      episodes: [],
    };

    expect(
      await refreshTvShowMetadataResult("show-local", {
        metadataMatcher: async () => metadata,
      }),
    ).toEqual({
      status: "matched",
      mediaItemId: "show-provider",
      matchedSeasons: 1,
      unmatchedSeasons: 0,
      addedEpisodes: 0,
    });

    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "show-local").executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "show-provider").executeTakeFirst(),
    ).toMatchObject({
      id: "show-provider",
    });
  });

  test("refreshes all seasons for a show", async () => {
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/tv")) {
        return Response.json({
          results: [
            {
              id: 63639,
              name: "The Expanse",
              first_air_date: "2015-12-14",
            },
          ],
        });
      }

      if (url.includes("/tv/63639/season/1")) {
        return Response.json({
          id: 60001,
          name: "Season 1",
          overview: "The first season.",
          air_date: "2015-12-14",
          poster_path: "/season.jpg",
          season_number: 1,
          episodes: [
            {
              id: 70001,
              name: "Dulcinea",
              overview: "The opener.",
              air_date: "2015-12-14",
              episode_number: 1,
              season_number: 1,
              runtime: 45,
              still_path: "/episode-1.jpg",
              vote_average: 8.1,
              vote_count: 10,
            },
          ],
        });
      }

      return Response.json({
        id: 63639,
        name: "The Expanse",
        original_name: "The Expanse",
        overview: "A missing person case becomes a system-wide mystery.",
        first_air_date: "2015-12-14",
        poster_path: "/show.jpg",
        backdrop_path: "/backdrop.jpg",
        popularity: 100,
        vote_average: 8.4,
        vote_count: 2000,
        status: "Ended",
        genres: [{ id: 10765, name: "Sci-Fi & Fantasy" }],
      });
    }) as typeof fetch;

    expect(await refreshTvShowMetadataResult("show-1")).toEqual({
      status: "matched",
      mediaItemId: "show-1",
      matchedSeasons: 1,
      unmatchedSeasons: 0,
      addedEpisodes: 0,
    });

    const show = await db.selectFrom("media_item").selectAll().where("id", "=", "show-1").executeTakeFirstOrThrow();
    expect(show).toMatchObject({
      provider: "tmdb",
      provider_id: "63639",
      overview: "A missing person case becomes a system-wide mystery.",
      poster_path: "/show.jpg",
    });
  });
});
