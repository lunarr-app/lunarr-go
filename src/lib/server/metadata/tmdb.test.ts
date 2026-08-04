import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, migrateDatabase, useDatabaseFileForTests } from "../db";
import { setSetting } from "../settings";
import {
  clearTmdbDetailCachesForTests,
  fetchTmdbShowMetadata,
  matchMovieMetadata,
  matchMovieMetadataById,
  matchTvSeasonMetadata,
  matchTvSeasonMetadataById,
  movieMetadataMatchAccepts,
  movieMetadataRuntimesCompatible,
  searchTmdbMovieCandidates,
  searchTmdbTvCandidates,
  testTmdbConnection,
  tmdbCredentialsConfigured,
} from "./tmdb";

beforeEach(() => {
  clearTmdbDetailCachesForTests();
});

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
            results: [{ id: 603, title: "The Matrix", release_date: "1999-03-31" }],
          });
        }

        return Response.json({
          id: 603,
          title: "The Matrix",
          release_date: "1999-03-31",
          poster_path: "/matrix.jpg",
        });
      };

      const metadata = await matchMovieMetadata("The Matrix", 1999, {
        fetch: mockedFetch as typeof fetch,
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
              vote_average: 8.2,
            },
          ],
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
          cast: [
            {
              id: 6384,
              credit_id: "cast-1",
              name: "Keanu Reeves",
              character: "Neo",
              order: 0,
            },
          ],
          crew: [
            {
              id: 1091,
              credit_id: "crew-1",
              name: "Lana Wachowski",
              department: "Directing",
              job: "Director",
            },
          ],
        },
        videos: {
          results: [
            {
              id: "video-1",
              name: "Trailer",
              key: "abc123",
              site: "YouTube",
              type: "Trailer",
              official: true,
            },
          ],
        },
        keywords: { keywords: [{ id: 310, name: "artificial reality" }] },
        release_dates: {
          results: [
            {
              iso_3166_1: "US",
              release_dates: [{ certification: "R", type: 3 }],
            },
          ],
        },
      });
    };

    const metadata = await matchMovieMetadata("The Matrix", 1999, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(calls[0]).toContain("query=The+Matrix");
    expect(calls[0]).toContain("year=1999");
    expect(calls[0]).toContain("primary_release_year=1999");
    expect(calls[1]).toContain("/movie/603");
    expect(calls[1]).toContain("append_to_response=credits%2Cvideos%2Ckeywords%2Crelease_dates%2Calternative_titles");
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
      certification: "R",
    });
    expect(metadata?.genres?.[0]?.name).toBe("Action");
    expect(metadata?.cast?.[0]).toMatchObject({
      name: "Keanu Reeves",
      character: "Neo",
    });
    expect(metadata?.crew?.[0]).toMatchObject({
      name: "Lana Wachowski",
      job: "Director",
    });
    expect(metadata?.trailer).toMatchObject({ site: "YouTube", key: "abc123" });
    expect(metadata?.keywords?.[0]?.name).toBe("artificial reality");
  });

  test("skips matching when no TMDb credential is configured", async () => {
    const metadata = await matchMovieMetadata("The Matrix", 1999, {
      credentials: {},
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
            results: [{ id: 603, title: "The Matrix", release_date: "1999-03-31" }],
          });
        }

        return Response.json({
          id: 603,
          title: "The Matrix",
          release_date: "1999-03-31",
        });
      };

      const metadata = await matchMovieMetadata("The Matrix", 1999, {
        fetch: mockedFetch as typeof fetch,
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
            {
              id: 604,
              title: "The Matrix Reloaded",
              release_date: "2003-05-15",
            },
            { id: 603, title: "The Matrix", release_date: "1999-03-31" },
          ],
        });
      }

      detailCalls.push(url);
      return Response.json({
        id: 603,
        title: "The Matrix",
        release_date: "1999-03-31",
      });
    };

    const metadata = await matchMovieMetadata("The Matrix", 1999, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
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
            { id: 348, title: "Alien", release_date: "1979-05-25" },
          ],
        });
      }

      detailCalls.push(url);
      return Response.json({
        id: 348,
        title: "Alien",
        release_date: "1979-05-25",
      });
    };

    const metadata = await matchMovieMetadata("Alien", null, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
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
            {
              id: 604,
              title: "The Matrix Reloaded",
              release_date: "2003-05-15",
            },
            { id: 603, title: "The Matrix", release_date: "1999-03-31" },
          ],
        });
      }

      detailCalls.push(url);
      return Response.json({
        id: 603,
        title: "The Matrix",
        release_date: "1999-03-31",
      });
    };

    const metadata = await matchMovieMetadata("The Matrix", 2000, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(detailCalls).toHaveLength(1);
    expect(detailCalls[0]).toContain("/movie/603");
    expect(metadata?.providerId).toBe("603");
  });

  test("retries adjacent and unscoped searches when the requested release year has no results", async () => {
    const searchCalls: string[] = [];
    const detailCalls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/search/movie")) {
        searchCalls.push(url);
        if (url.includes("primary_release_year=2013")) {
          return Response.json({ results: [] });
        }
        if (url.includes("primary_release_year=2014")) {
          return Response.json({
            results: [
              {
                id: 208284,
                title: "The Strange Color of Your Body's Tears",
                release_date: "2014-03-12",
              },
            ],
          });
        }
        return Response.json({ results: [] });
      }

      detailCalls.push(url);
      return Response.json({
        id: 208284,
        title: "The Strange Color of Your Body's Tears",
        release_date: "2014-03-12",
        runtime: 102,
      });
    };

    const metadata = await matchMovieMetadata("The Strange Color of Your Body's Tears", 2013, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(searchCalls.some((url) => url.includes("primary_release_year=2013"))).toBe(true);
    expect(searchCalls.some((url) => url.includes("primary_release_year=2014"))).toBe(true);
    expect(detailCalls).toHaveLength(1);
    expect(metadata).toMatchObject({
      providerId: "208284",
      year: 2014,
      runtimeSeconds: 6120,
    });
  });

  test("includes adult-catalog titles in movie search requests", async () => {
    const searchCalls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/search/movie")) {
        searchCalls.push(url);
        if (!url.includes("include_adult=true")) {
          return Response.json({ results: [] });
        }
        if (url.includes("primary_release_year=1992")) {
          return Response.json({
            results: [
              {
                id: 37265,
                title: "All Ladies Do It",
                original_title: "Così fan tutte",
                release_date: "1992-02-21",
              },
            ],
          });
        }
        return Response.json({
          results: [{ id: 849920, title: "All Ladies Do It", release_date: "2020-10-13" }],
        });
      }

      return Response.json({
        id: 37265,
        title: "All Ladies Do It",
        original_title: "Così fan tutte",
        release_date: "1992-02-21",
        runtime: 93,
      });
    };

    const metadata = await matchMovieMetadata("All Ladies Do It", 1992, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(searchCalls.every((url) => url.includes("include_adult=true"))).toBe(true);
    expect(metadata).toMatchObject({
      providerId: "37265",
      year: 1992,
      runtimeSeconds: 5580,
    });
  });

  test("matches alternate TMDb release titles from movie details", async () => {
    const detailCalls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            {
              id: 27328,
              title: "The Fun House",
              release_date: "1977-05-06",
            },
          ],
        });
      }

      detailCalls.push(url);
      return Response.json({
        id: 27328,
        title: "The Fun House",
        original_title: "The Fun House",
        release_date: "1977-05-06",
        runtime: 78,
        alternative_titles: {
          titles: [{ iso_3166_1: "US", title: "Last House on Dead End Street", type: "1979 Re-Release Title" }],
        },
      });
    };

    const metadata = await matchMovieMetadata("The Last House on Dead End Street", 1977, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(detailCalls).toHaveLength(1);
    expect(detailCalls[0]).toContain("/movie/27328");
    expect(metadata).toMatchObject({
      providerId: "27328",
      title: "The Fun House",
      year: 1977,
      runtimeSeconds: 4680,
      alternativeTitles: ["Last House on Dead End Street"],
    });
  });

  test("does not accept unrelated same-year movie results", async () => {
    const detailCalls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            {
              id: 991530,
              title: "Gentlemen Of The World",
              release_date: "2019-01-01",
            },
          ],
        });
      }

      detailCalls.push(url);
      return Response.json({
        id: 991530,
        title: "Gentlemen Of The World",
        release_date: "2019-01-01",
      });
    };

    const metadata = await matchMovieMetadata("The Gentlemen", 2019, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(metadata).toBeNull();
    expect(detailCalls.length).toBeGreaterThan(0);
  });

  test("matches a shorter title contained in the TMDb result title", async () => {
    const detailCalls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            {
              id: 529,
              title: "Wallace & Gromit in A Close Shave",
              release_date: "1995-12-24",
            },
          ],
        });
      }

      detailCalls.push(url);
      return Response.json({
        id: 529,
        title: "Wallace & Gromit in A Close Shave",
        release_date: "1995-12-24",
      });
    };

    const metadata = await matchMovieMetadata("A Close Shave", 1995, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(detailCalls).toHaveLength(1);
    expect(metadata?.providerId).toBe("529");
  });

  test("normalizes volume to vol for strict title matching", async () => {
    const detailCalls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            {
              id: 447365,
              title: "Guardians of the Galaxy Vol. 3",
              release_date: "2023-05-05",
            },
          ],
        });
      }

      detailCalls.push(url);
      return Response.json({
        id: 447365,
        title: "Guardians of the Galaxy Vol. 3",
        release_date: "2023-05-05",
      });
    };

    const metadata = await matchMovieMetadata("Guardians of the Galaxy Volume 3", 2023, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(detailCalls).toHaveLength(1);
    expect(metadata?.providerId).toBe("447365");
  });

  test("does not accept unrelated same-year TV results", async () => {
    const detailCalls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/tv")) {
        return Response.json({
          results: [
            {
              id: 123,
              name: "Different Show",
              first_air_date: "2004-01-01",
            },
          ],
        });
      }

      detailCalls.push(url);
      return Response.json({ id: 123, name: "Different Show" });
    };

    const metadata = await matchTvSeasonMetadata("Battlestar Galactica", 2004, 1, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(metadata).toBeNull();
    expect(detailCalls).toEqual([]);
  });

  test("connection test reports a successful metadata lookup", async () => {
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [{ id: 603, title: "The Matrix", release_date: "1999-03-31" }],
        });
      }

      return Response.json({
        id: 603,
        title: "The Matrix",
        release_date: "1999-03-31",
        poster_path: "/matrix.jpg",
      });
    };

    const result = await testTmdbConnection({
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      message: "TMDb returned The Matrix (1999).",
      title: "The Matrix",
      year: 1999,
      posterPath: "/matrix.jpg",
    });
  });

  test("connection test reports missing credentials", async () => {
    const result = await testTmdbConnection({ credentials: {} });

    expect(result).toEqual({
      ok: false,
      message: "TMDb credentials are missing or no test movie was returned.",
    });
  });
});

describe("movie metadata acceptance", () => {
  test("accepts adjacent release years when runtimes agree within tolerance", () => {
    expect(
      movieMetadataMatchAccepts({
        queryTitle: "The Strange Color of Your Body's Tears",
        queryYear: 2013,
        metadataTitle: "The Strange Color of Your Body's Tears",
        metadataYear: 2014,
        fileRuntimeSeconds: 6120,
        metadataRuntimeSeconds: 6120,
      }),
    ).toBe(true);
    expect(movieMetadataRuntimesCompatible(6120, 6300, 300)).toBe(true);
    expect(movieMetadataRuntimesCompatible(6120, 6600, 300)).toBe(false);
  });

  test("accepts adjacent release years when either runtime is unknown", () => {
    expect(
      movieMetadataMatchAccepts({
        queryTitle: "The Strange Color of Your Body's Tears",
        queryYear: 2013,
        metadataTitle: "The Strange Color of Your Body's Tears",
        metadataYear: 2014,
        fileRuntimeSeconds: null,
        metadataRuntimeSeconds: 6120,
      }),
    ).toBe(true);
  });

  test("accepts alternate release titles against the stored primary title", () => {
    expect(
      movieMetadataMatchAccepts({
        queryTitle: "The Last House on Dead End Street",
        queryYear: 1977,
        metadataTitle: "The Fun House",
        metadataYear: 1977,
        metadataAlternativeTitles: ["Last House on Dead End Street"],
        fileRuntimeSeconds: 4680,
        metadataRuntimeSeconds: 4680,
      }),
    ).toBe(true);
  });

  test("rejects adjacent release years when runtimes disagree", () => {
    expect(
      movieMetadataMatchAccepts({
        queryTitle: "The Strange Color of Your Body's Tears",
        queryYear: 2013,
        metadataTitle: "The Strange Color of Your Body's Tears",
        metadataYear: 2014,
        fileRuntimeSeconds: 5400,
        metadataRuntimeSeconds: 6120,
      }),
    ).toBe(false);
  });

  test("rejects matches more than one year apart", () => {
    expect(
      movieMetadataMatchAccepts({
        queryTitle: "The Matrix",
        queryYear: 2002,
        metadataTitle: "The Matrix",
        metadataYear: 1999,
        fileRuntimeSeconds: 8160,
        metadataRuntimeSeconds: 8160,
      }),
    ).toBe(false);
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
              backdrop_path: "/search-backdrop.jpg",
            },
          ],
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
              vote_count: 20,
            },
          ],
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
        created_by: [
          {
            id: 2,
            credit_id: "creator-1",
            name: "Ronald D. Moore",
            profile_path: "/rdm.jpg",
          },
        ],
        aggregate_credits: {
          cast: [
            {
              id: 1,
              name: "Edward James Olmos",
              roles: [{ credit_id: "role-1", character: "William Adama" }],
              order: 0,
              profile_path: "/ej.jpg",
            },
          ],
          crew: [
            {
              id: 2,
              name: "Ronald D. Moore",
              department: "Writing",
              jobs: [{ credit_id: "job-1", job: "Developer" }],
            },
          ],
        },
        videos: {
          results: [
            {
              id: "video-1",
              name: "Trailer",
              key: "abc123",
              site: "YouTube",
              type: "Trailer",
              official: true,
            },
          ],
        },
        keywords: { results: [{ id: 10, name: "space opera" }] },
        content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-14" }] },
        external_ids: { imdb_id: "tt0407362" },
      });
    };

    const metadata = await matchTvSeasonMetadata("Battlestar Galactica", 2004, 1, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(calls[0]).toContain("/search/tv");
    expect(calls[0]).toContain("query=Battlestar+Galactica");
    expect(calls[0]).toContain("first_air_date_year=2004");
    expect(calls[0]).toContain("include_adult=true");
    expect(calls[1]).toContain("/tv/1972");
    expect(calls[1]).toContain(
      "append_to_response=aggregate_credits%2Cvideos%2Ckeywords%2Ccontent_ratings%2Cexternal_ids",
    );
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
      imdbId: "tt0407362",
    });
    expect(metadata?.show.genres?.[0]?.name).toBe("Sci-Fi & Fantasy");
    expect(metadata?.show.cast?.[0]).toMatchObject({
      name: "Edward James Olmos",
      character: "William Adama",
    });
    expect(metadata?.show.crew?.[0]).toMatchObject({
      name: "Ronald D. Moore",
      job: "Creator",
    });
    expect(metadata?.show.trailer).toMatchObject({
      site: "YouTube",
      key: "abc123",
    });
    expect(metadata?.show.keywords?.[0]?.name).toBe("space opera");
    expect(metadata?.season).toMatchObject({
      providerId: "123",
      title: "Season 1",
      seasonNumber: 1,
      overview: "The first season.",
      posterPath: "/season.jpg",
      airDate: "2004-10-18",
      voteAverage: 8.1,
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
      voteCount: 20,
    });
  });
});

describe("matchMovieMetadataById", () => {
  test("maps a TMDb movie detail response fetched directly by ID", async () => {
    const calls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);
      return Response.json({
        id: 603,
        title: "The Matrix",
        overview: "A hacker discovers the nature of reality.",
        release_date: "1999-03-31",
        runtime: 136,
        poster_path: "/poster.jpg",
        backdrop_path: "/backdrop.jpg",
        popularity: 100,
        vote_average: 8.3,
        vote_count: 12000,
        imdb_id: "tt0133093",
        genres: [{ id: 28, name: "Action" }],
      });
    };

    const metadata = await matchMovieMetadataById(603, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/movie/603");
    expect(metadata).toMatchObject({
      provider: "tmdb",
      providerId: "603",
      title: "The Matrix",
      year: 1999,
      overview: "A hacker discovers the nature of reality.",
      runtimeSeconds: 8160,
      posterPath: "/poster.jpg",
      imdbId: "tt0133093",
    });
    expect(metadata?.genres?.[0]?.name).toBe("Action");
  });

  test("returns null when TMDb has no movie for the ID", async () => {
    const mockedFetch = async (_input: URL | RequestInfo) => new Response("{}", { status: 404 });

    expect(
      await matchMovieMetadataById(999999999, {
        credentials: { token: "test-token" },
        fetch: mockedFetch as typeof fetch,
      }),
    ).toBeNull();
  });

  test("rethrows non-404 TMDb errors", async () => {
    const mockedFetch = async (_input: URL | RequestInfo) => new Response("{}", { status: 500 });

    expect(
      matchMovieMetadataById(603, {
        credentials: { token: "test-token" },
        fetch: mockedFetch as typeof fetch,
      }),
    ).rejects.toThrow("TMDb request failed with 500");
  });
});

describe("fetchTmdbShowMetadata and matchTvSeasonMetadataById", () => {
  const showDetail = {
    id: 1396,
    name: "Breaking Bad",
    original_name: "Breaking Bad",
    overview: "A chemistry teacher turns meth maker.",
    first_air_date: "2008-01-20",
    poster_path: "/bb.jpg",
    backdrop_path: "/bb-backdrop.jpg",
    popularity: 90,
    vote_average: 8.9,
    vote_count: 14000,
    status: "Ended",
    external_ids: { imdb_id: "tt0903747" },
  };

  test("fetches show metadata directly by ID without a search request", async () => {
    const calls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      calls.push(String(input));
      return Response.json(showDetail);
    };

    const metadata = await fetchTmdbShowMetadata(1396, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/tv/1396");
    expect(metadata).toMatchObject({
      provider: "tmdb",
      providerId: "1396",
      title: "Breaking Bad",
      year: 2008,
      firstAirDate: "2008-01-20",
      posterPath: "/bb.jpg",
      imdbId: "tt0903747",
    });
  });

  test("maps season metadata for a show fetched by ID", async () => {
    const calls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/tv/1396/season/1")) {
        return Response.json({
          id: 3572,
          name: "Season 1",
          season_number: 1,
          air_date: "2008-01-20",
          episodes: [
            {
              id: 62085,
              name: "Pilot",
              season_number: 1,
              episode_number: 1,
              air_date: "2008-01-20",
              runtime: 58,
            },
          ],
        });
      }
      return Response.json(showDetail);
    };

    const lookup = await matchTvSeasonMetadataById(1396, 1, {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(calls.some((url) => url.includes("/tv/1396"))).toBe(true);
    expect(calls.some((url) => url.includes("/tv/1396/season/1"))).toBe(true);
    expect(calls.every((url) => !url.includes("/search/tv"))).toBe(true);
    expect(lookup?.show.providerId).toBe("1396");
    expect(lookup?.season).toMatchObject({ providerId: "3572", seasonNumber: 1 });
    expect(lookup?.episodes[0]).toMatchObject({
      providerId: "62085",
      title: "Pilot",
      seasonNumber: 1,
      episodeNumber: 1,
      runtimeSeconds: 3480,
    });
  });

  test("returns null when the show or season is missing on TMDb", async () => {
    const notFoundFetch = async (_input: URL | RequestInfo) => new Response("{}", { status: 404 });

    expect(
      await fetchTmdbShowMetadata(999999999, {
        credentials: { token: "test-token" },
        fetch: notFoundFetch as typeof fetch,
      }),
    ).toBeNull();

    const missingSeasonFetch = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/season/")) return new Response("{}", { status: 404 });
      return Response.json(showDetail);
    };

    expect(
      await matchTvSeasonMetadataById(1396, 99, {
        credentials: { token: "test-token" },
        fetch: missingSeasonFetch as typeof fetch,
      }),
    ).toBeNull();
  });
});

describe("TMDb match candidate search", () => {
  test("maps movie search results into lightweight candidates", async () => {
    const calls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      calls.push(String(input));
      return Response.json({
        results: [
          {
            id: 603,
            title: "The Matrix",
            release_date: "1999-03-31",
            overview: "A hacker discovers the nature of reality.",
            poster_path: "/matrix.jpg",
          },
          {
            id: 604,
            title: "The Matrix Reloaded",
            release_date: "2003-05-15",
            poster_path: null,
          },
        ],
      });
    };

    const candidates = await searchTmdbMovieCandidates("matrix", {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(calls[0]).toContain("/search/movie");
    expect(calls[0]).toContain("query=matrix");
    expect(candidates).toEqual([
      {
        providerId: "603",
        title: "The Matrix",
        year: 1999,
        overview: "A hacker discovers the nature of reality.",
        posterPath: "/matrix.jpg",
      },
      {
        providerId: "604",
        title: "The Matrix Reloaded",
        year: 2003,
        overview: null,
        posterPath: null,
      },
    ]);
  });

  test("maps TV search results into lightweight candidates", async () => {
    const calls: string[] = [];
    const mockedFetch = async (input: URL | RequestInfo) => {
      calls.push(String(input));
      return Response.json({
        results: [
          {
            id: 1396,
            name: "Breaking Bad",
            first_air_date: "2008-01-20",
            overview: "A chemistry teacher turns meth maker.",
            poster_path: "/bb.jpg",
          },
        ],
      });
    };

    const candidates = await searchTmdbTvCandidates("breaking bad", {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(calls[0]).toContain("/search/tv");
    expect(calls[0]).toContain("query=breaking+bad");
    expect(candidates).toEqual([
      {
        providerId: "1396",
        title: "Breaking Bad",
        year: 2008,
        overview: "A chemistry teacher turns meth maker.",
        posterPath: "/bb.jpg",
      },
    ]);
  });

  test("caps candidate lists", async () => {
    const mockedFetch = async (_input: URL | RequestInfo) =>
      Response.json({
        results: Array.from({ length: 25 }, (_, index) => ({
          id: index + 1,
          title: `Movie ${index + 1}`,
          release_date: "2020-01-01",
        })),
      });

    const candidates = await searchTmdbMovieCandidates("movie", {
      credentials: { token: "test-token" },
      fetch: mockedFetch as typeof fetch,
    });

    expect(candidates).toHaveLength(10);
  });
});
