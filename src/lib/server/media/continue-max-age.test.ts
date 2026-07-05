import { afterEach, describe, expect, test } from "bun:test";
import { continueMaxAgeEnabled, isContinueProgressFresh, setContinueMaxAgeDaysForTests } from "./continue-max-age";

describe("continue max age", () => {
  afterEach(() => {
    setContinueMaxAgeDaysForTests(undefined);
  });

  test("treats zero days as disabled", () => {
    setContinueMaxAgeDaysForTests(0);
    expect(continueMaxAgeEnabled()).toBe(false);
    expect(isContinueProgressFresh("2000-01-01T00:00:00.000Z")).toBe(true);
  });

  test("hides progress older than the configured window", () => {
    setContinueMaxAgeDaysForTests(90);
    const now = new Date("2026-06-19T12:00:00.000Z");
    const freshUpdatedAt = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000).toISOString();
    const staleUpdatedAt = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString();

    expect(isContinueProgressFresh(freshUpdatedAt, now)).toBe(true);
    expect(isContinueProgressFresh(staleUpdatedAt, now)).toBe(false);
  });

  test("uses iso cutoffs that match watch_progress.updated_at ordering", () => {
    setContinueMaxAgeDaysForTests(90);
    const now = new Date("2026-06-19T12:00:00.000Z");
    const cutoffIso = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const freshUpdatedAt = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000).toISOString();
    const staleUpdatedAt = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString();

    expect(freshUpdatedAt > cutoffIso).toBe(isContinueProgressFresh(freshUpdatedAt, now));
    expect(staleUpdatedAt > cutoffIso).toBe(isContinueProgressFresh(staleUpdatedAt, now));
  });
});
