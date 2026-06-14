import { describe, expect, test } from "bun:test";
import { lookupMovieMetadata } from "./matching";

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
