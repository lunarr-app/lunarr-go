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

describe("formatMediaDuration", () => {
  test("formats runtime lengths", () => {
    expect(formatMediaDuration(45)).toBe("45s");
    expect(formatMediaDuration(125)).toBe("2m 05s");
    expect(formatMediaDuration(3665)).toBe("1h 01m");
  });
});

describe("formatClockDuration", () => {
  test("formats playback clock positions", () => {
    expect(formatClockDuration(75)).toBe("1:15");
    expect(formatClockDuration(3665)).toBe("1:01");
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
