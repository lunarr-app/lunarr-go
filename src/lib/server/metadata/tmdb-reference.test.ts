import { describe, expect, test } from "bun:test";
import { parseTmdbReference } from "./tmdb-reference";

describe("parseTmdbReference", () => {
  test("parses bare numeric IDs without a kind", () => {
    expect(parseTmdbReference("603")).toEqual({ kind: null, tmdbId: 603 });
    expect(parseTmdbReference(" 1396 ")).toEqual({ kind: null, tmdbId: 1396 });
  });

  test("parses movie URLs with and without slugs", () => {
    expect(parseTmdbReference("https://www.themoviedb.org/movie/603")).toEqual({ kind: "movie", tmdbId: 603 });
    expect(parseTmdbReference("https://www.themoviedb.org/movie/603-the-matrix")).toEqual({
      kind: "movie",
      tmdbId: 603,
    });
    expect(parseTmdbReference("https://www.themoviedb.org/movie/603-the-matrix?language=en-US")).toEqual({
      kind: "movie",
      tmdbId: 603,
    });
  });

  test("parses TV URLs including season sub-paths", () => {
    expect(parseTmdbReference("https://www.themoviedb.org/tv/1396-breaking-bad")).toEqual({
      kind: "tv",
      tmdbId: 1396,
    });
    expect(parseTmdbReference("https://www.themoviedb.org/tv/1396-breaking-bad/seasons/1")).toEqual({
      kind: "tv",
      tmdbId: 1396,
    });
  });

  test("parses localized URLs and scheme-less hosts", () => {
    expect(parseTmdbReference("https://www.themoviedb.org/en/movie/603-the-matrix")).toEqual({
      kind: "movie",
      tmdbId: 603,
    });
    expect(parseTmdbReference("themoviedb.org/tv/1396")).toEqual({ kind: "tv", tmdbId: 1396 });
    expect(parseTmdbReference("www.themoviedb.org/movie/603")).toEqual({ kind: "movie", tmdbId: 603 });
  });

  test("rejects blank input, unknown URLs, and non-numeric segments", () => {
    expect(parseTmdbReference("")).toBeNull();
    expect(parseTmdbReference("   ")).toBeNull();
    expect(parseTmdbReference("The Matrix")).toBeNull();
    expect(parseTmdbReference("https://example.com/movie/603")).toBeNull();
    expect(parseTmdbReference("https://www.imdb.com/title/tt0133093/")).toBeNull();
    expect(parseTmdbReference("https://www.themoviedb.org/movie")).toBeNull();
    expect(parseTmdbReference("https://www.themoviedb.org/movie/the-matrix")).toBeNull();
    expect(parseTmdbReference("not a url")).toBeNull();
  });
});
