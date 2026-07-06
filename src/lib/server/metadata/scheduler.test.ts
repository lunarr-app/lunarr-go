import { describe, expect, test } from "bun:test";
import { scheduledMetadataRefreshDelayMs } from "./scheduler";

describe("scheduled metadata refresh", () => {
  test("does not schedule without an interval", () => {
    expect(scheduledMetadataRefreshDelayMs("movie", { intervalHours: null, lastScheduledAt: null })).toBeNull();
    expect(scheduledMetadataRefreshDelayMs("tv", { intervalHours: 0, lastScheduledAt: null })).toBeNull();
  });

  test("uses last scheduled refresh as the anchor", () => {
    const nowMs = Date.parse("2026-07-06T12:00:00.000Z");
    expect(
      scheduledMetadataRefreshDelayMs("movie", {
        intervalHours: 24,
        lastScheduledAt: "2026-07-05T12:00:00.000Z",
        nowMs,
      }),
    ).toBe(0);
    expect(
      scheduledMetadataRefreshDelayMs("tv", {
        intervalHours: 24,
        lastScheduledAt: "2026-07-06T06:00:00.000Z",
        nowMs,
      }),
    ).toBe(18 * 3_600_000);
  });

  test("caps long waits at the maximum timeout slice", () => {
    const nowMs = Date.parse("2026-07-06T00:00:00.000Z");
    expect(
      scheduledMetadataRefreshDelayMs("movie", {
        intervalHours: 720,
        lastScheduledAt: "2026-07-06T00:00:00.000Z",
        nowMs,
      }),
    ).toBe(2_147_483_647);
  });
});
