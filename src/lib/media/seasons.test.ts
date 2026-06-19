import { describe, expect, test } from "bun:test";
import { resolveShowSeason, showSeasonHref, showSeasonKey } from "./seasons";

describe("showSeasonKey", () => {
  test("prefers season number when available", () => {
    expect(showSeasonKey({ id: "season-uuid", seasonNumber: 1 })).toBe("1");
    expect(showSeasonKey({ id: "season-uuid", seasonNumber: 0 })).toBe("0");
  });

  test("falls back to id when season number is missing", () => {
    expect(showSeasonKey({ id: "season-uuid", seasonNumber: null })).toBe("season-uuid");
    expect(showSeasonKey({ id: "season-uuid" })).toBe("season-uuid");
  });
});

describe("showSeasonHref", () => {
  test("builds stable season routes", () => {
    expect(showSeasonHref("show-1", { id: "season-uuid", seasonNumber: 2 })).toBe("/shows/show-1/seasons/2");
  });
});

describe("resolveShowSeason", () => {
  const seasons = [
    { id: "season-1", seasonNumber: 1, title: "Season 1" },
    { id: "season-2", seasonNumber: 2, title: "Season 2" },
  ];

  test("resolves by internal id", () => {
    expect(resolveShowSeason(seasons, "season-2")).toEqual(seasons[1]);
  });

  test("resolves by season number", () => {
    expect(resolveShowSeason(seasons, "1")).toEqual(seasons[0]);
  });

  test("returns null for unknown keys", () => {
    expect(resolveShowSeason(seasons, "missing")).toBeNull();
    expect(resolveShowSeason(seasons, "99")).toBeNull();
  });
});
