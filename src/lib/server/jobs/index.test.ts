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
import { cleanupJobHistory, getScanJobSummary, listScanErrors } from ".";
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

  test("cleans inactive job history older than retention while preserving active jobs and recent rows", async () => {
    const old = "2026-01-01T00:00:00.000Z";
    const recent = "2026-02-15T00:00:00.000Z";
    await db
      .insertInto("scan_job")
      .values([
        {
          id: "old-scan-delete",
          job_kind: "library_scan",
          library_id: "library-1",
          status: "completed",
          started_at: old,
          finished_at: old,
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          errors_count: 1,
          created_at: old,
          updated_at: old,
        },
        {
          id: "old-scan-keep-active",
          library_id: null,
          job_kind: "movie_metadata_refresh",
          status: "running",
          started_at: old,
          finished_at: null,
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          errors_count: 0,
          created_at: old,
          updated_at: old,
        },
        {
          id: "recent-scan-keep",
          job_kind: "library_scan",
          library_id: "library-1",
          status: "completed",
          started_at: recent,
          finished_at: recent,
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          errors_count: 0,
          created_at: recent,
          updated_at: recent,
        },
      ])
      .execute();
    await db
      .insertInto("scan_job_error")
      .values({
        scan_job_id: "old-scan-delete",
        path: "old-path",
        message: "old error",
        created_at: old,
      })
      .execute();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Viewer",
        email: "viewer@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      })
      .execute();
    await db
      .insertInto("media_item")
      .values({
        id: "movie-1",
        kind: "movie",
        title: "Movie",
        sort_title: "Movie",
        release_date: null,
        parent_id: null,
        created_at: recent,
        updated_at: recent,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "file-1",
        library_id: "library-1",
        media_item_id: "movie-1",
        path: path.join(tempDir, "Movie.mkv"),
        basename: "Movie.mkv",
        extension: ".mkv",
        size_bytes: 1,
        mtime_ms: Date.now(),
        duration_seconds: 120,
        created_at: recent,
        updated_at: recent,
      })
      .execute();
    await db
      .insertInto("playback_session")
      .values([
        {
          id: "old-playback-delete",
          media_file_id: "file-1",
          user_id: "user-1",
          status: "completed",
          mode: "transcode",
          error_message: null,
          last_heartbeat_at: old,
          last_segment_request_at: null,
          last_segment_name: null,
          last_segment_index: null,
          start_time_seconds: 0,
          started_at: old,
          finished_at: old,
          created_at: old,
          updated_at: old,
        },
        {
          id: "old-playback-keep-active",
          media_file_id: "file-1",
          user_id: "user-1",
          status: "running",
          mode: "transcode",
          error_message: null,
          last_heartbeat_at: old,
          last_segment_request_at: null,
          last_segment_name: null,
          last_segment_index: null,
          start_time_seconds: 0,
          started_at: old,
          finished_at: null,
          created_at: old,
          updated_at: old,
        },
        {
          id: "recent-playback-keep",
          media_file_id: "file-1",
          user_id: "user-1",
          status: "completed",
          mode: "transcode",
          error_message: null,
          last_heartbeat_at: recent,
          last_segment_request_at: null,
          last_segment_name: null,
          last_segment_index: null,
          start_time_seconds: 0,
          started_at: recent,
          finished_at: recent,
          created_at: recent,
          updated_at: recent,
        },
      ])
      .execute();
    await db
      .insertInto("playback_hls_artifact")
      .values({
        id: "artifact-delete",
        playback_session_id: "old-playback-delete",
        media_file_id: "file-1",
        path: path.join(tempDir, "playback-sessions", "old-playback-delete", "master.m3u8"),
        mime_type: null,
        created_at: old,
        updated_at: old,
      })
      .execute();

    await expect(
      cleanupJobHistory({
        maxAgeMs: 24 * 60 * 60 * 1000,
        minRows: 1,
        now: new Date("2026-02-15T00:00:00.000Z"),
      }),
    ).resolves.toEqual({ scanJobs: 1, playbackSessions: 1 });

    expect(
      (await db.selectFrom("scan_job").select("id").orderBy("id").execute()).map((job) => job.id),
    ).toContain("old-scan-keep-active");
    expect(
      (await db.selectFrom("scan_job").select("id").orderBy("id").execute()).map((job) => job.id),
    ).not.toContain("old-scan-delete");
    expect(
      await db
        .selectFrom("scan_job_error")
        .select("id")
        .where("scan_job_id", "=", "old-scan-delete")
        .execute(),
    ).toHaveLength(0);
    expect(
      (await db.selectFrom("playback_session").select("id").orderBy("id").execute()).map((job) => job.id),
    ).toContain("old-playback-keep-active");
    expect(
      (await db.selectFrom("playback_session").select("id").orderBy("id").execute()).map((job) => job.id),
    ).not.toContain("old-playback-delete");
    expect(
      await db
        .selectFrom("playback_hls_artifact")
        .select("id")
        .where("playback_session_id", "=", "old-playback-delete")
        .execute(),
    ).toHaveLength(0);
  });

  test("preserves each library's latest scan row while pruning old scan history", async () => {
    const older = "2026-01-01T00:00:00.000Z";
    const latest = "2026-01-02T00:00:00.000Z";
    await db
      .insertInto("library")
      .values({
        id: "library-2",
        name: "Archive",
        kind: "movie",
        path: path.join(tempDir, "archive"),
        created_at: older,
        updated_at: older,
      })
      .execute();
    await db
      .insertInto("scan_job")
      .values([
        {
          id: "old-library-scan-delete",
          job_kind: "library_scan",
          library_id: "library-2",
          status: "completed",
          started_at: older,
          finished_at: older,
          files_seen: 1,
          files_added: 1,
          files_updated: 0,
          errors_count: 0,
          created_at: older,
          updated_at: older,
        },
        {
          id: "latest-library-scan-keep",
          job_kind: "library_scan",
          library_id: "library-2",
          status: "completed",
          started_at: latest,
          finished_at: latest,
          files_seen: 2,
          files_added: 0,
          files_updated: 1,
          errors_count: 0,
          created_at: latest,
          updated_at: latest,
        },
        {
          id: "old-metadata-delete",
          job_kind: "movie_metadata_refresh",
          library_id: null,
          status: "completed",
          started_at: older,
          finished_at: older,
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          errors_count: 0,
          created_at: older,
          updated_at: older,
        },
      ])
      .execute();

    await expect(
      cleanupJobHistory({
        maxAgeMs: 24 * 60 * 60 * 1000,
        minRows: 0,
        now: new Date("2026-02-15T00:00:00.000Z"),
      }),
    ).resolves.toEqual({ scanJobs: 2, playbackSessions: 0 });

    const remainingScanIds = (
      await db.selectFrom("scan_job").select("id").orderBy("id").execute()
    ).map((job) => job.id);
    expect(remainingScanIds).toContain("latest-library-scan-keep");
    expect(remainingScanIds).not.toContain("old-library-scan-delete");
    expect(remainingScanIds).not.toContain("old-metadata-delete");
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
