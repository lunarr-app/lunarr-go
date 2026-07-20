import { describe, expect, test } from "bun:test";
import {
  BROWSE_RAIL_LIMIT,
  catalogPageInfo,
  MOVIE_BROWSE_RAILS,
  normalizeLimit,
  normalizeMovieSort,
  normalizeMovieStatusFilter,
  normalizePage,
  normalizeShowSort,
  paginatedSlice,
  parseBrowseRails,
  SHOW_BROWSE_RAILS,
} from "./catalog";

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
    expect(normalizeMovieSort(undefined, "recent")).toBe("recent");
    expect(normalizeMovieSort("unknown", "recent")).toBe("recent");
  });

  test("normalizes show sort options", () => {
    expect(normalizeShowSort("title")).toBe("title");
    expect(normalizeShowSort("recent")).toBe("recent");
    expect(normalizeShowSort("latest")).toBe("latest");
    expect(normalizeShowSort("popular")).toBe("popular");
    expect(normalizeShowSort("unknown")).toBe("title");
    expect(normalizeShowSort(undefined, "latest")).toBe("latest");
    expect(normalizeShowSort("unknown", "latest")).toBe("latest");
  });

  test("parses browse rail query params", () => {
    expect(parseBrowseRails(null, MOVIE_BROWSE_RAILS)).toBeUndefined();
    expect(parseBrowseRails("", MOVIE_BROWSE_RAILS)).toBeUndefined();
    expect(parseBrowseRails("recent", MOVIE_BROWSE_RAILS)).toEqual(["recent"]);
    expect(parseBrowseRails("continueWatching", MOVIE_BROWSE_RAILS)).toEqual(["continueWatching"]);
    expect(parseBrowseRails("continueWatching,recent", MOVIE_BROWSE_RAILS)).toEqual(["continueWatching", "recent"]);
    expect(parseBrowseRails("recent, recent", MOVIE_BROWSE_RAILS)).toEqual(["recent"]);
    expect(parseBrowseRails("nextUp", MOVIE_BROWSE_RAILS)).toBeNull();
    expect(parseBrowseRails("recent,bogus", MOVIE_BROWSE_RAILS)).toBeNull();

    expect(parseBrowseRails(null, SHOW_BROWSE_RAILS)).toBeUndefined();
    expect(parseBrowseRails("nextUp", SHOW_BROWSE_RAILS)).toEqual(["nextUp"]);
    expect(parseBrowseRails("continueWatching", SHOW_BROWSE_RAILS)).toEqual(["continueWatching"]);
    expect(parseBrowseRails("nextUp,popular", SHOW_BROWSE_RAILS)).toEqual(["nextUp", "popular"]);
    expect(parseBrowseRails("bogus", SHOW_BROWSE_RAILS)).toBeNull();
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

  test("normalizes browse limits", () => {
    expect(normalizeLimit(null)).toBe(BROWSE_RAIL_LIMIT);
    expect(normalizeLimit("12")).toBe(12);
    expect(normalizeLimit("0")).toBe(BROWSE_RAIL_LIMIT);
    expect(normalizeLimit("250")).toBe(200);
    expect(normalizeLimit("bad")).toBe(BROWSE_RAIL_LIMIT);
  });

  test("paginates in-memory slices", () => {
    const items = ["a", "b", "c", "d", "e"];
    expect(paginatedSlice(1, 2, items)).toEqual({
      items: ["a", "b"],
      page: catalogPageInfo(1, 2, 5),
    });
    expect(paginatedSlice(2, 2, items)).toEqual({
      items: ["c", "d"],
      page: catalogPageInfo(2, 2, 5),
    });
    expect(paginatedSlice(3, 2, items)).toEqual({
      items: ["e"],
      page: catalogPageInfo(3, 2, 5),
    });
  });
});
