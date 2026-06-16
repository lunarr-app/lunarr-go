import { describe, expect, test } from "bun:test";
import { lookupMovieMetadata, lookupMovieMetadataFromCandidates } from "./matching";
import type { MatchedMovieMetadata } from "./tmdb";

describe("lookupMovieMetadata", () => {
  test("returns metadata from the configured matcher", async () => {
    const result = await lookupMovieMetadata("The Matrix", 1999, undefined, async (title, year) => ({
      provider: "tmdb",
      providerId: "603",
      title,
      year,
      overview: "A hacker discovers the nature of reality.",
      runtimeSeconds: 8160,
      posterPath: "/poster.jpg",
      backdropPath: "/backdrop.jpg",
      releaseDate: "1999-03-31",
      popularity: 100,
      voteAverage: 8.3,
    }));

    expect(result).toMatchObject({
      provider: "tmdb",
      providerId: "603",
      title: "The Matrix",
      year: 1999,
      posterPath: "/poster.jpg",
    });
  });

  test("returns null and reports metadata lookup errors", async () => {
    const errors: unknown[] = [];
    const result = await lookupMovieMetadata(
      "The Matrix",
      1999,
      async (error) => {
        errors.push(error);
      },
      async () => {
        throw new Error("TMDb unavailable");
      },
    );

    expect(result).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });
});

describe("lookupMovieMetadataFromCandidates", () => {
  test("prefers the strongest candidate match instead of stopping at the first weak match", async () => {
    const matcher = async (title: string, year: number | null): Promise<MatchedMovieMetadata | null> => {
      if (title === "Disney's Snow White" && year === 2025) {
        return {
          provider: "tmdb",
          providerId: "wrong",
          title: "Snow White and the Seven Dwarfs",
          year: 1937,
          overview: null,
          runtimeSeconds: null,
          posterPath: null,
          backdropPath: null,
          releaseDate: "1937-12-21",
          popularity: null,
          voteAverage: null,
        };
      }

      if (title === "Snow White" && year === 2025) {
        return {
          provider: "tmdb",
          providerId: "correct",
          title: "Snow White",
          year: 2025,
          overview: null,
          runtimeSeconds: null,
          posterPath: null,
          backdropPath: null,
          releaseDate: "2025-03-21",
          popularity: null,
          voteAverage: null,
        };
      }

      return null;
    };

    const result = await lookupMovieMetadataFromCandidates(
      [
        { title: "Disney's Snow White", year: 2025 },
        { title: "Snow White", year: 2025 },
      ],
      { matcher },
    );

    expect(result?.metadata.providerId).toBe("correct");
    expect(result?.candidate).toEqual({ title: "Snow White", year: 2025 });
  });

  test("accepts adjacent release years when file and TMDb runtimes agree", async () => {
    const matcher = async (title: string, year: number | null): Promise<MatchedMovieMetadata | null> => {
      if (title === "The Strange Color of Your Body's Tears" && year === 2013) {
        return {
          provider: "tmdb",
          providerId: "208284",
          title: "The Strange Color of Your Body's Tears",
          year: 2014,
          overview: null,
          runtimeSeconds: 6120,
          posterPath: null,
          backdropPath: null,
          releaseDate: "2014-03-12",
          popularity: null,
          voteAverage: null,
        };
      }
      return null;
    };

    const result = await lookupMovieMetadataFromCandidates(
      [{ title: "The Strange Color of Your Body's Tears", year: 2013 }],
      {
        matcher,
        fileRuntimeSeconds: 6120,
      },
    );

    expect(result?.metadata.providerId).toBe("208284");
    expect(result?.candidate).toEqual({ title: "The Strange Color of Your Body's Tears", year: 2013 });
  });
});
