import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, migrateDatabase, useDatabaseFileForTests } from "../db";
import { setSetting } from "../settings";
import { matchMovieMetadata, matchTvSeasonMetadata, testTmdbConnection, tmdbCredentialsConfigured } from "./tmdb";

describe("matchMovieMetadata", () => {
  test("reports whether TMDb credentials are configured", async () => {
    expect(await tmdbCredentialsConfigured({})).toBe(false);
    expect(await tmdbCredentialsConfigured({ apiKey: "test-key" })).toBe(true);
    expect(await tmdbCredentialsConfigured({ token: "test-token" })).toBe(true);
  });

  test("uses the bundled fallback token when no user credential is configured", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-tmdb-fallback-"));

    try {
      await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
      await migrateDatabase();
      expect(await tmdbCredentialsConfigured()).toBe(true);

      const authHeaders: Array<string | undefined> = [];
      const mockedFetch = async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = String(input);
        authHeaders.push((init?.headers as Record<string, string> | undefined)?.authorization);

        if (url.includes("/search/movie")) {
          return Response.json({
            results: [{ id: 603, title: "The Matrix", release_date: "1999-03-31" }]
          });
        }

        return Response.json({
          id: 603,
          title: "The Matrix",
          release_date: "1999-03-31",
          poster_path: "/matrix.jpg"
        });
      };

      const metadata = await matchMovieMetadata("The Matrix", 1999, {
        fetch: mockedFetch as typeof fetch
      });

      expect(metadata?.providerId).toBe("603");
      expect(authHeaders).toHaveLength(2);
      expect(authHeaders.every((header) => header?.startsWith("Bearer "))).toBe(true);
    } finally {
      await closeDatabaseForTests();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("maps TMDb search and detail responses into stored movie metadata", async () => {
    const calls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            {
              id: 603,
              title: "The Matrix",
              release_date: "1999-03-31",
              poster_path: "/poster.jpg",
              backdrop_path: "/backdrop.jpg",
              popularity: 99,
              vote_average: 8.2
            }
          ]
        });
      }

      return Response.json({
        id: 603,
        title: "The Matrix",
        overview: "A hacker discovers the nature of reality.",
        release_date: "1999-03-31",
        runtime: 136,
        poster_path: "/poster-detail.jpg",
        backdrop_path: "/backdrop-detail.jpg",
        popularity: 100,
        vote_average: 8.3,
        vote_count: 12000,
        imdb_id: "tt0133093",
        tagline: "Welcome to the Real World.",
        genres: [{ id: 28, name: "Action" }],
        credits: {
          cast: [{ id: 6384, credit_id: "cast-1", name: "Keanu Reeves", character: "Neo", order: 0 }],
          crew: [{ id: 1091, credit_id: "crew-1", name: "Lana Wachowski", department: "Directing", job: "Director" }]
        },
        videos: {
          results: [{ id: "video-1", name: "Trailer", key: "abc123", site: "YouTube", type: "Trailer", official: true }]
        },
        keywords: { keywords: [{ id: 310, name: "artificial reality" }] },
        release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ certification: "R", type: 3 }] }] }
      });
    };

    const metadata = await matchMovieMetadata("The Matrix", 1999, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch
    });

    expect(calls[0]).toContain("query=The+Matrix");
    expect(calls[0]).toContain("year=1999");
    expect(calls[0]).toContain("primary_release_year=1999");
    expect(calls[1]).toContain("/movie/603");
    expect(calls[1]).toContain("append_to_response=credits%2Cvideos%2Ckeywords%2Crelease_dates");
    expect(metadata).toMatchObject({
      provider: "tmdb",
      providerId: "603",
      title: "The Matrix",
      year: 1999,
      overview: "A hacker discovers the nature of reality.",
      runtimeSeconds: 8160,
      posterPath: "/poster-detail.jpg",
      backdropPath: "/backdrop-detail.jpg",
      releaseDate: "1999-03-31",
      popularity: 100,
      voteAverage: 8.3,
      voteCount: 12000,
      imdbId: "tt0133093",
      tagline: "Welcome to the Real World.",
      certification: "R"
    });
    expect(metadata?.genres?.[0]?.name).toBe("Action");
    expect(metadata?.cast?.[0]).toMatchObject({ name: "Keanu Reeves", character: "Neo" });
    expect(metadata?.crew?.[0]).toMatchObject({ name: "Lana Wachowski", job: "Director" });
    expect(metadata?.trailer).toMatchObject({ site: "YouTube", key: "abc123" });
    expect(metadata?.keywords?.[0]?.name).toBe("artificial reality");
  });

  test("skips matching when no TMDb credential is configured", async () => {
    const metadata = await matchMovieMetadata("The Matrix", 1999, {
      credentials: {}
    });

    expect(metadata).toBeNull();
  });

  test("uses saved TMDb settings credentials when no override is supplied", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-tmdb-settings-"));

    try {
      await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
      await migrateDatabase();
      await setSetting("tmdb_api_key", "saved-key");

      const calls: string[] = [];
      const mockedFetch = async (input: URL | RequestInfo) => {
        const url = String(input);
        calls.push(url);

        if (url.includes("/search/movie")) {
          return Response.json({
            results: [{ id: 603, title: "The Matrix", release_date: "1999-03-31" }]
          });
        }

        return Response.json({
          id: 603,
          title: "The Matrix",
          release_date: "1999-03-31"
        });
      };

      const metadata = await matchMovieMetadata("The Matrix", 1999, {
        fetch: mockedFetch as typeof fetch
      });

      expect(metadata?.providerId).toBe("603");
      expect(calls).toHaveLength(2);
      expect(calls[0]).toContain("api_key=saved-key");
      expect(calls[1]).toContain("api_key=saved-key");
    } finally {
      await closeDatabaseForTests();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("prefers a search result with the requested release year", async () => {
    const detailCalls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            { id: 604, title: "The Matrix Reloaded", release_date: "2003-05-15" },
            { id: 603, title: "The Matrix", release_date: "1999-03-31" }
          ]
        });
      }

      detailCalls.push(url);
      return Response.json({
        id: 603,
        title: "The Matrix",
        release_date: "1999-03-31"
      });
    };

    const metadata = await matchMovieMetadata("The Matrix", 1999, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch
    });

    expect(detailCalls).toHaveLength(1);
    expect(detailCalls[0]).toContain("/movie/603");
    expect(metadata?.providerId).toBe("603");
    expect(metadata?.year).toBe(1999);
  });

  test("prefers exact title matches over the first search result when year is unknown", async () => {
    const detailCalls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            { id: 8077, title: "Alien 3", release_date: "1992-05-22" },
            { id: 348, title: "Alien", release_date: "1979-05-25" }
          ]
        });
      }

      detailCalls.push(url);
      return Response.json({
        id: 348,
        title: "Alien",
        release_date: "1979-05-25"
      });
    };

    const metadata = await matchMovieMetadata("Alien", null, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch
    });

    expect(detailCalls).toHaveLength(1);
    expect(detailCalls[0]).toContain("/movie/348");
    expect(metadata?.providerId).toBe("348");
  });

  test("uses exact title as a fallback when no search result matches the requested year", async () => {
    const detailCalls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            { id: 604, title: "The Matrix Reloaded", release_date: "2003-05-15" },
            { id: 603, title: "The Matrix", release_date: "1999-03-31" }
          ]
        });
      }

      detailCalls.push(url);
      return Response.json({
        id: 603,
        title: "The Matrix",
        release_date: "1999-03-31"
      });
    };

    const metadata = await matchMovieMetadata("The Matrix", 2000, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch
    });

    expect(detailCalls).toHaveLength(1);
    expect(detailCalls[0]).toContain("/movie/603");
    expect(metadata?.providerId).toBe("603");
  });

  test("connection test reports a successful metadata lookup", async () => {
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [{ id: 603, title: "The Matrix", release_date: "1999-03-31" }]
        });
      }

      return Response.json({
        id: 603,
        title: "The Matrix",
        release_date: "1999-03-31",
        poster_path: "/matrix.jpg"
      });
    };

    const result = await testTmdbConnection({
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch
    });

    expect(result).toEqual({
      ok: true,
      message: "TMDb returned The Matrix (1999).",
      title: "The Matrix",
      year: 1999,
      posterPath: "/matrix.jpg"
    });
  });

  test("connection test reports missing credentials", async () => {
    const result = await testTmdbConnection({ credentials: {} });

    expect(result).toEqual({
      ok: false,
      message: "TMDb credentials are missing or no test movie was returned."
    });
  });
});

describe("matchTvSeasonMetadata", () => {
  test("maps TMDb TV search, show detail, and season responses into normalized metadata", async () => {
    const calls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);

      if (url.includes("/search/tv")) {
        return Response.json({
          results: [
            {
              id: 1972,
              name: "Battlestar Galactica",
              first_air_date: "2004-10-18",
              poster_path: "/search-poster.jpg",
              backdrop_path: "/search-backdrop.jpg"
            }
          ]
        });
      }

      if (url.includes("/tv/1972/season/1")) {
        return Response.json({
          id: 123,
          name: "Season 1",
          season_number: 1,
          air_date: "2004-10-18",
          poster_path: "/season.jpg",
          overview: "The first season.",
          vote_average: 8.1,
          episodes: [
            {
              id: 456,
              name: "33",
              season_number: 1,
              episode_number: 1,
              overview: "The fleet jumps every 33 minutes.",
              air_date: "2004-10-18",
              runtime: 44,
              still_path: "/33.jpg",
              vote_average: 8.7,
              vote_count: 20
            }
          ]
        });
      }

      return Response.json({
        id: 1972,
        name: "Battlestar Galactica",
        original_name: "Battlestar Galactica",
        overview: "Humanity searches for Earth.",
        first_air_date: "2004-10-18",
        poster_path: "/poster.jpg",
        backdrop_path: "/backdrop.jpg",
        popularity: 80,
        vote_average: 8.2,
        vote_count: 1200,
        status: "Ended",
        tagline: "So say we all.",
        homepage: "https://example.test/bsg",
        original_language: "en",
        genres: [{ id: 10765, name: "Sci-Fi & Fantasy" }],
        aggregate_credits: {
          cast: [
            {
              id: 1,
              name: "Edward James Olmos",
              roles: [{ credit_id: "role-1", character: "William Adama" }],
              order: 0,
              profile_path: "/ej.jpg"
            }
          ],
          crew: [
            {
              id: 2,
              name: "Ronald D. Moore",
              department: "Writing",
              jobs: [{ credit_id: "job-1", job: "Developer" }]
            }
          ]
        },
        videos: {
          results: [{ id: "video-1", name: "Trailer", key: "abc123", site: "YouTube", type: "Trailer", official: true }]
        },
        keywords: { results: [{ id: 10, name: "space opera" }] },
        content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-14" }] },
        external_ids: { imdb_id: "tt0407362" }
      });
    };

    const metadata = await matchTvSeasonMetadata("Battlestar Galactica", 2004, 1, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch
    });

    expect(calls[0]).toContain("/search/tv");
    expect(calls[0]).toContain("query=Battlestar+Galactica");
    expect(calls[0]).toContain("first_air_date_year=2004");
    expect(calls[1]).toContain("/tv/1972");
    expect(calls[1]).toContain("append_to_response=aggregate_credits%2Cvideos%2Ckeywords%2Ccontent_ratings%2Cexternal_ids");
    expect(calls[2]).toContain("/tv/1972/season/1");
    expect(metadata?.show).toMatchObject({
      provider: "tmdb",
      providerId: "1972",
      title: "Battlestar Galactica",
      year: 2004,
      overview: "Humanity searches for Earth.",
      posterPath: "/poster.jpg",
      backdropPath: "/backdrop.jpg",
      firstAirDate: "2004-10-18",
      certification: "TV-14",
      imdbId: "tt0407362"
    });
    expect(metadata?.show.genres?.[0]?.name).toBe("Sci-Fi & Fantasy");
    expect(metadata?.show.cast?.[0]).toMatchObject({ name: "Edward James Olmos", character: "William Adama" });
    expect(metadata?.show.crew?.[0]).toMatchObject({ name: "Ronald D. Moore", job: "Developer" });
    expect(metadata?.show.trailer).toMatchObject({ site: "YouTube", key: "abc123" });
    expect(metadata?.show.keywords?.[0]?.name).toBe("space opera");
    expect(metadata?.season).toMatchObject({
      providerId: "123",
      title: "Season 1",
      seasonNumber: 1,
      overview: "The first season.",
      posterPath: "/season.jpg",
      airDate: "2004-10-18",
      voteAverage: 8.1
    });
    expect(metadata?.episodes[0]).toMatchObject({
      providerId: "456",
      title: "33",
      seasonNumber: 1,
      episodeNumber: 1,
      overview: "The fleet jumps every 33 minutes.",
      stillPath: "/33.jpg",
      airDate: "2004-10-18",
      runtimeSeconds: 2640,
      voteAverage: 8.7,
      voteCount: 20
    });
  });
});
