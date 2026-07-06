import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import * as schedulerModule from "./metadata/scheduler";
import { getMetadataRefreshIntervalHours, getMetadataStalenessDays } from "./metadata/settings";
import { updateMetadataSettings } from "./settings-commands";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-settings-commands-"));
  await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
  await migrateDatabase();
});

afterEach(async () => {
  await closeDatabaseForTests();
  await rm(tempDir, { recursive: true, force: true });
});

describe("updateMetadataSettings", () => {
  test("persists metadata refresh settings and reschedules timers", async () => {
    const syncSpy = spyOn(schedulerModule, "syncScheduledMetadataRefresh").mockResolvedValue(undefined);

    await updateMetadataSettings({
      movieMetadataRefreshIntervalHours: 24,
      tvMetadataRefreshIntervalHours: 168,
      movieMetadataStalenessDays: 30,
      tvMetadataStalenessDays: 14,
    });

    expect(await getMetadataRefreshIntervalHours("movie")).toBe(24);
    expect(await getMetadataRefreshIntervalHours("tv")).toBe(168);
    expect(await getMetadataStalenessDays("movie")).toBe(30);
    expect(await getMetadataStalenessDays("tv")).toBe(14);
    expect(syncSpy).toHaveBeenCalledTimes(1);

    syncSpy.mockRestore();
  });

  test("reschedules timers even when only staleness changes", async () => {
    await updateMetadataSettings({
      movieMetadataRefreshIntervalHours: 24,
    });

    const syncSpy = spyOn(schedulerModule, "syncScheduledMetadataRefresh").mockResolvedValue(undefined);

    await updateMetadataSettings({
      movieMetadataStalenessDays: 7,
    });

    expect(await getMetadataStalenessDays("movie")).toBe(7);
    expect(syncSpy).toHaveBeenCalledTimes(1);

    syncSpy.mockRestore();
  });
});
