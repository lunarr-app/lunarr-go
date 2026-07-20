import { describe, expect, test } from "bun:test";
import {
  formatClockDuration,
  formatDateTime,
  formatElapsedDuration,
  formatEpisodeCode,
  formatFileSize,
  formatGibibytes,
  formatMediaDuration,
  formatRelativeTime,
  formatReleaseDate,
  formatFileCountLabel,
  formatVoteAverageLabel,
  formatVoteCountLabel,
  seasonTabLabel,
} from "./format";

describe("formatDateTime", () => {
  test("formats valid timestamps", () => {
    expect(formatDateTime("2026-01-05T12:30:00.000Z")).toContain("2026");
  });

  test("uses configurable fallbacks", () => {
    expect(formatDateTime(null)).toBe("Unknown");
    expect(formatDateTime(null, { fallback: "never" })).toBe("Never");
    expect(formatDateTime(null, { fallback: "not-yet" })).toBe("Not yet");
    expect(formatDateTime("invalid", { fallback: "never" })).toBe("Never");
  });
});

describe("formatRelativeTime", () => {
  test("formats recent timestamps relative to now", () => {
    const now = Date.parse("2026-06-15T12:00:00.000Z");
    expect(formatRelativeTime("2026-06-15T11:59:30.000Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-06-15T11:30:00.000Z", now)).toBe("30m ago");
  });
});

describe("formatReleaseDate", () => {
  test("formats date-only values as locale dates without timezone shift", () => {
    const label = formatReleaseDate("2011-04-17");
    expect(label).toContain("2011");
    expect(label).toContain("17");
  });

  test("returns null for missing or invalid values", () => {
    expect(formatReleaseDate(null)).toBeNull();
    expect(formatReleaseDate("")).toBeNull();
    expect(formatReleaseDate("not-a-date")).toBeNull();
  });
});

describe("formatMediaDuration", () => {
  test("formats runtime lengths", () => {
    expect(formatMediaDuration(45)).toBe("45s");
    expect(formatMediaDuration(125)).toBe("2m 05s");
    expect(formatMediaDuration(3665)).toBe("1h 01m");
  });

  test("floors probed fractional seconds for display", () => {
    expect(formatMediaDuration(3174.1)).toBe("52m 54s");
    expect(formatMediaDuration(125.9)).toBe("2m 05s");
  });
});

describe("formatClockDuration", () => {
  test("formats playback clock positions", () => {
    expect(formatClockDuration(75)).toBe("1:15");
    expect(formatClockDuration(3665)).toBe("1:01");
  });

  test("floors probed fractional seconds for display", () => {
    expect(formatClockDuration(3174.1)).toBe("52:54");
    expect(formatClockDuration(3665.9)).toBe("1:01");
  });
});

describe("formatElapsedDuration", () => {
  test("formats job elapsed time", () => {
    const start = "2026-06-15T12:00:00.000Z";
    const end = "2026-06-15T12:02:30.000Z";
    expect(formatElapsedDuration(start, end)).toBe("2m 30s");
    expect(formatElapsedDuration(null, end)).toBe("Not started");
  });
});

describe("formatFileSize", () => {
  test("formats byte sizes", () => {
    expect(formatFileSize(0)).toBe("Unknown size");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
  });
});

describe("formatGibibytes", () => {
  test("formats gibibyte labels", () => {
    expect(formatGibibytes(2 * 1024 * 1024 * 1024)).toBe("2 GiB");
    expect(formatGibibytes(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GiB");
  });
});

describe("formatFileCountLabel", () => {
  test("formats file counts", () => {
    expect(formatFileCountLabel(1)).toBe("1 file");
    expect(formatFileCountLabel(3)).toBe("3 files");
  });
});

describe("formatVoteAverageLabel", () => {
  test("formats vote averages", () => {
    expect(formatVoteAverageLabel(8.456)).toBe("8.5");
    expect(formatVoteAverageLabel(null)).toBeNull();
  });
});

describe("formatVoteCountLabel", () => {
  test("formats compact vote counts", () => {
    expect(formatVoteCountLabel(173)).toBe("173");
    expect(formatVoteCountLabel(1200)).toMatch(/1\.2/);
    expect(formatVoteCountLabel(null)).toBeNull();
  });
});

describe("seasonTabLabel", () => {
  test("prefers season number labels", () => {
    expect(seasonTabLabel({ title: "Season 1", seasonNumber: 1 })).toBe("Season 1");
    expect(seasonTabLabel({ title: "Specials", seasonNumber: 0 })).toBe("Season 0");
  });

  test("falls back to title when season number is missing", () => {
    expect(seasonTabLabel({ title: "Bonus Content" })).toBe("Bonus Content");
    expect(seasonTabLabel({ title: "Season 2", seasonNumber: null })).toBe("Season 2");
  });
});

describe("formatEpisodeCode", () => {
  test("formats padded episode codes", () => {
    expect(formatEpisodeCode({ seasonNumber: 1, episodeNumber: 5 })).toBe("S01E05");
    expect(formatEpisodeCode({ seasonNumber: 12, episodeNumber: 3 })).toBe("S12E03");
  });

  test("formats short guest episode codes", () => {
    expect(formatEpisodeCode({ seasonNumber: 1, episodeNumber: 5 }, { style: "short" })).toBe("1x5");
    expect(formatEpisodeCode({ seasonNumber: null, episodeNumber: 2 }, { style: "short" })).toBe("?x2");
  });

  test("returns empty string when numbers are missing", () => {
    expect(formatEpisodeCode({ seasonNumber: null, episodeNumber: null })).toBe("");
    expect(formatEpisodeCode(null)).toBe("");
    expect(formatEpisodeCode({ seasonNumber: null, episodeNumber: 5 })).toBe("S?E05");
  });
});
