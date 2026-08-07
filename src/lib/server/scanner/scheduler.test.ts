import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { createLibrary } from "../libraries";
import * as scanJobs from "./scan-jobs";
import { scheduledScanDelayMs, shouldScheduleLibraryScan, syncScheduledLibraryScans } from "./scheduler";

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
    expect(scheduledScanDelayMs({ ...base, last_scheduled_scan_at: "2026-06-10T11:45:00.000Z" }, nowMs)).toBe(
      45 * 60_000,
    );
  });

  test("keeps long intervals waiting after the maximum timeout slice", () => {
    const maxTimeoutMs = 2_147_483_647;
    const anchorMs = Date.parse("2026-06-10T00:00:00.000Z");
    const library = {
      id: "library-1",
      kind: "movie",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
      scan_interval_minutes: 43_200,
      last_scheduled_scan_at: null,
    };

    expect(scheduledScanDelayMs(library, anchorMs)).toBe(maxTimeoutMs);
    expect(scheduledScanDelayMs(library, anchorMs + maxTimeoutMs)).toBe(43_200 * 60_000 - maxTimeoutMs);
  });
});

describe("syncScheduledLibraryScans", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-scheduler-db-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();
  });

  afterAll(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("schedules and runs a scan for a library that is due", async () => {
    const mediaDir = path.join(tempDir, "due-library");
    await mkdir(mediaDir);
    const library = await createLibrary({
      name: "Due Library",
      kind: "movie",
      path: mediaDir,
      scanIntervalMinutes: 60,
    });
    const now = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await db.updateTable("library").set({ last_scheduled_scan_at: now }).where("id", "=", library.id).execute();

    const startSpy = spyOn(scanJobs, "startScan").mockResolvedValue(library.id);
    try {
      await syncScheduledLibraryScans();
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(startSpy.mock.calls[0][0]).toBe(library.id);

      const updated = await db
        .selectFrom("library")
        .select("last_scheduled_scan_at")
        .where("id", "=", library.id)
        .executeTakeFirstOrThrow();
      expect(updated.last_scheduled_scan_at).not.toBeNull();
    } finally {
      startSpy.mockRestore();
    }

    await db.deleteFrom("library").where("id", "=", library.id).execute();
  });

  test("does not schedule libraries without an interval", async () => {
    const mediaDir = path.join(tempDir, "unscheduled-library");
    await mkdir(mediaDir);
    const library = await createLibrary({
      name: "Unscheduled Library",
      kind: "movie",
      path: mediaDir,
    });

    const startSpy = spyOn(scanJobs, "startScan").mockResolvedValue(library.id);
    try {
      await syncScheduledLibraryScans();
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(startSpy).not.toHaveBeenCalled();
    } finally {
      startSpy.mockRestore();
    }

    await db.deleteFrom("library").where("id", "=", library.id).execute();
  });
});
