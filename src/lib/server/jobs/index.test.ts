import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
} from "../db";
import type { Database } from "../db/schema";
import { getScanJobSummary, listScanErrors } from ".";
import { expectRejectsToThrow } from "$lib/test/async-expect";

describe("scan job listings", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-jobs-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "library-1",
        name: "Movies",
        kind: "movie",
        path: tempDir,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("scan_job")
      .values([
        {
          id: "job-1",
          library_id: "library-1",
          status: "completed",
          started_at: now,
          finished_at: now,
          files_seen: 1,
          files_added: 0,
          files_updated: 0,
          errors_count: 1,
          created_at: now,
          updated_at: now,
        },
        {
          id: "job-2",
          library_id: "library-1",
          status: "running",
          started_at: now,
          finished_at: null,
          files_seen: 2,
          files_added: 1,
          files_updated: 0,
          errors_count: 0,
          created_at: now,
          updated_at: now,
        },
        {
          id: "job-3",
          library_id: "library-1",
          status: "failed",
          started_at: now,
          finished_at: now,
          files_seen: 3,
          files_added: 0,
          files_updated: 0,
          errors_count: 2,
          created_at: now,
          updated_at: now,
        },
        {
          id: "job-4",
          library_id: "library-1",
          status: "cancelled",
          started_at: now,
          finished_at: now,
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          errors_count: 0,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("scan_job_error")
      .values({
        scan_job_id: "job-1",
        path: path.join(tempDir, "Broken.Movie.2024.mkv"),
        message: "Could not read file.",
        created_at: now,
      })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("includes scan job and library context for recent errors", async () => {
    const errors = await listScanErrors();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      scan_job_id: "job-1",
      job_status: "completed",
      library_id: "library-1",
      library_name: "Movies",
      message: "Could not read file.",
    });
  });

  test("summarizes scan job status counts and recorded errors", async () => {
    expect(await getScanJobSummary()).toEqual({
      total: 4,
      active: 1,
      completed: 1,
      failed: 1,
      cancelled: 1,
      errors: 3,
    });
  });

  test("allows only one active metadata refresh job per kind", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("scan_job")
      .values({
        id: "movie-metadata-1",
        job_kind: "movie_metadata_refresh",
        library_id: null,
        status: "queued",
        started_at: null,
        finished_at: null,
        files_seen: 0,
        files_added: 0,
        files_updated: 0,
        errors_count: 0,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await expectRejectsToThrow(
      db
        .insertInto("scan_job")
        .values({
          id: "movie-metadata-2",
          job_kind: "movie_metadata_refresh",
          library_id: null,
          status: "running",
          started_at: now,
          finished_at: null,
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          errors_count: 0,
          created_at: now,
          updated_at: now,
        })
        .execute(),
    );

    await db
      .insertInto("scan_job")
      .values({
        id: "tv-metadata-1",
        job_kind: "tv_metadata_refresh",
        library_id: null,
        status: "queued",
        started_at: null,
        finished_at: null,
        files_seen: 0,
        files_added: 0,
        files_updated: 0,
        errors_count: 0,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await expectRejectsToThrow(
      db
        .insertInto("scan_job")
        .values({
          id: "tv-metadata-2",
          job_kind: "tv_metadata_refresh",
          library_id: null,
          status: "running",
          started_at: now,
          finished_at: null,
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          errors_count: 0,
          created_at: now,
          updated_at: now,
        })
        .execute(),
    );

    await db
      .insertInto("scan_job")
      .values({
        id: "media-probe-1",
        job_kind: "media_probe_refresh",
        library_id: null,
        status: "queued",
        started_at: null,
        finished_at: null,
        files_seen: 0,
        files_added: 0,
        files_updated: 0,
        errors_count: 0,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await expectRejectsToThrow(
      db
        .insertInto("scan_job")
        .values({
          id: "media-probe-2",
          job_kind: "media_probe_refresh",
          library_id: null,
          status: "running",
          started_at: now,
          finished_at: null,
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          errors_count: 0,
          created_at: now,
          updated_at: now,
        })
        .execute(),
    );

    await db
      .updateTable("scan_job")
      .set({ status: "completed", finished_at: now, updated_at: now })
      .where("id", "=", "movie-metadata-1")
      .execute();
    expect(
      await db
        .insertInto("scan_job")
        .values({
          id: "movie-metadata-3",
          job_kind: "movie_metadata_refresh",
          library_id: null,
          status: "queued",
          started_at: null,
          finished_at: null,
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          errors_count: 0,
          created_at: now,
          updated_at: now,
        })
        .execute(),
    ).toBeDefined();
  });
});
