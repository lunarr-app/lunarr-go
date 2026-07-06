import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeDatabaseForTests, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import {
  getMetadataRefreshIntervalHours,
  getMetadataStalenessDays,
  normalizeRefreshIntervalHours,
  normalizeStalenessDays,
  setMetadataRefreshIntervalHours,
  setMetadataStalenessDays,
} from "./settings";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-metadata-settings-"));
  await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
  await migrateDatabase();
});

describe("metadata settings", () => {
  test("normalizes refresh interval hours to off or bounded integers", () => {
    expect(normalizeRefreshIntervalHours(null)).toBeNull();
    expect(normalizeRefreshIntervalHours(0)).toBeNull();
    expect(normalizeRefreshIntervalHours(1)).toBe(1);
    expect(normalizeRefreshIntervalHours(720)).toBe(720);
    expect(normalizeRefreshIntervalHours(721)).toBeNull();
    expect(normalizeRefreshIntervalHours(1.5)).toBeNull();
  });

  test("normalizes staleness days to a bounded integer range", () => {
    expect(normalizeStalenessDays(undefined)).toBe(0);
    expect(normalizeStalenessDays(-5)).toBe(0);
    expect(normalizeStalenessDays(14.9)).toBe(14);
    expect(normalizeStalenessDays(3650)).toBe(3650);
    expect(normalizeStalenessDays(4000)).toBe(3650);
  });

  test("stores and reads back movie and tv metadata settings", async () => {
    await setMetadataRefreshIntervalHours("movie", 24);
    await setMetadataRefreshIntervalHours("tv", 168);
    await setMetadataStalenessDays("movie", 30);
    await setMetadataStalenessDays("tv", 14);

    expect(await getMetadataRefreshIntervalHours("movie")).toBe(24);
    expect(await getMetadataRefreshIntervalHours("tv")).toBe(168);
    expect(await getMetadataStalenessDays("movie")).toBe(30);
    expect(await getMetadataStalenessDays("tv")).toBe(14);
  });
});

afterEach(async () => {
  await closeDatabaseForTests();
  await rm(tempDir, { recursive: true, force: true });
});
