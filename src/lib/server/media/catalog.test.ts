import { describe, expect, test } from "bun:test";
import { normalizeMovieSort, normalizeMovieStatusFilter, normalizePage, normalizeShowSort } from "./catalog";

describe("movie browse parameters", () => {
  test("normalizes watch-status filters", () => {
    expect(normalizeMovieStatusFilter("watched")).toBe("watched");
    expect(normalizeMovieStatusFilter("unwatched")).toBe("unwatched");
    expect(normalizeMovieStatusFilter("all")).toBe("all");
    expect(normalizeMovieStatusFilter("invalid")).toBe("all");
    expect(normalizeMovieStatusFilter(null)).toBe("all");
  });

  test("normalizes sort options", () => {
    expect(normalizeMovieSort("title")).toBe("title");
    expect(normalizeMovieSort("recent")).toBe("recent");
    expect(normalizeMovieSort("year_desc")).toBe("year_desc");
    expect(normalizeMovieSort("rating")).toBe("rating");
    expect(normalizeMovieSort("unknown")).toBe("title");
    expect(normalizeMovieSort(undefined)).toBe("title");
  });

  test("normalizes show sort options", () => {
    expect(normalizeShowSort("title")).toBe("title");
    expect(normalizeShowSort("recent")).toBe("recent");
    expect(normalizeShowSort("latest")).toBe("latest");
    expect(normalizeShowSort("popular")).toBe("popular");
    expect(normalizeShowSort("unknown")).toBe("title");
  });

  test("normalizes page numbers", () => {
    expect(normalizePage("2")).toBe(2);
    expect(normalizePage(3)).toBe(3);
    expect(normalizePage("0")).toBe(1);
    expect(normalizePage("-1")).toBe(1);
    expect(normalizePage("1.5")).toBe(1);
    expect(normalizePage("bad")).toBe(1);
    expect(normalizePage(null)).toBe(1);
  });
});
