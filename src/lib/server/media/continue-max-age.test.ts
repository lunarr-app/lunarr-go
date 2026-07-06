import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import {
  getContinueMaxAgeDays,
  isContinueProgressFresh,
  normalizeContinueMaxAgeDays,
  setUserContinueMaxAgeDays,
} from "./continue-max-age";

describe("continue max age", () => {
  test("treats zero days as disabled", () => {
    expect(isContinueProgressFresh("2000-01-01T00:00:00.000Z", { maxAgeDays: 0 })).toBe(true);
  });

  test("hides progress older than the configured window", () => {
    const now = new Date("2026-06-19T12:00:00.000Z");
    const freshUpdatedAt = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000).toISOString();
    const staleUpdatedAt = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString();

    expect(isContinueProgressFresh(freshUpdatedAt, { maxAgeDays: 90, now })).toBe(true);
    expect(isContinueProgressFresh(staleUpdatedAt, { maxAgeDays: 90, now })).toBe(false);
  });

  test("uses iso cutoffs that match watch_progress.updated_at ordering", () => {
    const now = new Date("2026-06-19T12:00:00.000Z");
    const cutoffIso = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const freshUpdatedAt = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000).toISOString();
    const staleUpdatedAt = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString();

    expect(freshUpdatedAt > cutoffIso).toBe(isContinueProgressFresh(freshUpdatedAt, { maxAgeDays: 90, now }));
    expect(staleUpdatedAt > cutoffIso).toBe(isContinueProgressFresh(staleUpdatedAt, { maxAgeDays: 90, now }));
  });

  test("normalizes invalid values to zero", () => {
    expect(normalizeContinueMaxAgeDays(undefined)).toBe(0);
    expect(normalizeContinueMaxAgeDays("not-a-number")).toBe(0);
    expect(normalizeContinueMaxAgeDays(4000)).toBe(3650);
    expect(normalizeContinueMaxAgeDays(-5)).toBe(0);
  });
});

describe("continue max age database", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-continue-max-age-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("defaults to zero when unset", async () => {
    expect(await getContinueMaxAgeDays("user-1")).toBe(0);
  });

  test("persists per-user values", async () => {
    await setUserContinueMaxAgeDays("user-1", 90);
    await setUserContinueMaxAgeDays("user-2", 30);

    expect(await getContinueMaxAgeDays("user-1")).toBe(90);
    expect(await getContinueMaxAgeDays("user-2")).toBe(30);
  });

  test("normalizes values when saving", async () => {
    await setUserContinueMaxAgeDays("user-1", "not-a-number");
    await setUserContinueMaxAgeDays("user-2", 9999);

    expect(await getContinueMaxAgeDays("user-1")).toBe(0);
    expect(await getContinueMaxAgeDays("user-2")).toBe(3650);
  });
});
