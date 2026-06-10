import { describe, expect, test } from "bun:test";
import { scheduledScanDelayMs, shouldScheduleLibraryScan } from "./scheduler";

describe("scheduled library scans", () => {
  test("only schedules scannable libraries with an interval", () => {
    expect(shouldScheduleLibraryScan({ kind: "movie", scan_interval_minutes: 60 })).toBe(true);
    expect(shouldScheduleLibraryScan({ kind: "tv", scan_interval_minutes: 60 })).toBe(true);
    expect(shouldScheduleLibraryScan({ kind: "movie", scan_interval_minutes: null })).toBe(false);
    expect(shouldScheduleLibraryScan({ kind: "music", scan_interval_minutes: 60 })).toBe(false);
  });

  test("uses last scheduled scan, updated time, then creation time as the interval anchor", () => {
    const nowMs = Date.parse("2026-06-10T12:00:00.000Z");
    const base = {
      id: "library-1",
      kind: "movie",
      created_at: "2026-06-10T10:00:00.000Z",
      updated_at: "2026-06-10T11:00:00.000Z",
      scan_interval_minutes: 60,
      last_scheduled_scan_at: null,
    };

    expect(scheduledScanDelayMs(base, nowMs)).toBe(0);
    expect(scheduledScanDelayMs({ ...base, updated_at: "2026-06-10T11:30:00.000Z" }, nowMs)).toBe(30 * 60_000);
    expect(scheduledScanDelayMs({ ...base, last_scheduled_scan_at: "2026-06-10T11:45:00.000Z" }, nowMs)).toBe(45 * 60_000);
  });
});
