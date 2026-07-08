import { describe, expect, test } from "bun:test";
import { MAX_SCHEDULED_TIMEOUT_MS } from "../time";
import { scheduledMetadataRefreshDelayMs } from "./scheduler";

describe("scheduled metadata refresh", () => {
  test("does not schedule without an interval", () => {
    expect(scheduledMetadataRefreshDelayMs({ intervalHours: null, lastScheduledAt: null })).toBeNull();
    expect(scheduledMetadataRefreshDelayMs({ intervalHours: 0, lastScheduledAt: null })).toBeNull();
  });

  test("uses last scheduled refresh as the anchor", () => {
    const nowMs = Date.parse("2026-07-06T12:00:00.000Z");
    expect(
      scheduledMetadataRefreshDelayMs({
        intervalHours: 24,
        lastScheduledAt: "2026-07-05T12:00:00.000Z",
        nowMs,
      }),
    ).toBe(0);
    expect(
      scheduledMetadataRefreshDelayMs({
        intervalHours: 24,
        lastScheduledAt: "2026-07-06T06:00:00.000Z",
        nowMs,
      }),
    ).toBe(18 * 3_600_000);
  });

  test("falls back to now when the anchor is invalid", () => {
    const nowMs = Date.parse("2026-07-06T12:00:00.000Z");
    expect(
      scheduledMetadataRefreshDelayMs({
        intervalHours: 24,
        lastScheduledAt: "not-a-date",
        nowMs,
      }),
    ).toBe(24 * 3_600_000);
  });

  test("caps long waits at the maximum timeout slice", () => {
    const nowMs = Date.parse("2026-07-06T00:00:00.000Z");
    expect(
      scheduledMetadataRefreshDelayMs({
        intervalHours: 720,
        lastScheduledAt: "2026-07-06T00:00:00.000Z",
        nowMs,
      }),
    ).toBe(MAX_SCHEDULED_TIMEOUT_MS);
  });
});
