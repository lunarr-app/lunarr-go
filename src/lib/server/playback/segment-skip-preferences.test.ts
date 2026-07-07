import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import {
  getSegmentSkipPreferences,
  normalizeSegmentSkipAutomatic,
  normalizeSegmentSkipEnabled,
  setSegmentSkipPreferences,
} from "./segment-skip-preferences";

describe("segment skip preferences", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-segment-skip-prefs-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("normalizes enabled values", () => {
    expect(normalizeSegmentSkipEnabled(true)).toBe(true);
    expect(normalizeSegmentSkipEnabled("on")).toBe(true);
    expect(normalizeSegmentSkipEnabled("0")).toBe(false);
    expect(normalizeSegmentSkipEnabled(undefined)).toBe(true);
  });

  test("normalizes automatic values", () => {
    expect(normalizeSegmentSkipAutomatic(true)).toBe(true);
    expect(normalizeSegmentSkipAutomatic("1")).toBe(true);
    expect(normalizeSegmentSkipAutomatic("false")).toBe(false);
    expect(normalizeSegmentSkipAutomatic(undefined)).toBe(false);
  });

  test("stores per-user segment skip preferences", async () => {
    await setSegmentSkipPreferences("user-1", { enabled: false, automatic: true });

    expect(await getSegmentSkipPreferences("user-1")).toEqual({
      enabled: false,
      automatic: true,
    });
  });

  test("updates one preference without clearing the other", async () => {
    await setSegmentSkipPreferences("user-1", { enabled: false, automatic: true });
    await setSegmentSkipPreferences("user-1", { automatic: false });

    expect(await getSegmentSkipPreferences("user-1")).toEqual({
      enabled: false,
      automatic: false,
    });
  });

  test("defaults when user id is missing", async () => {
    expect(await getSegmentSkipPreferences(null)).toEqual({
      enabled: true,
      automatic: false,
    });
  });
});
