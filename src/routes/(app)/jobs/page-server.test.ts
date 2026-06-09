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
  type Database,
} from "$lib/server/db";
import { actions, load } from "./+page.server";
import { expectRejectsToMatchObject } from "$lib/test/async-expect";

type JobsLoadResult = {
  summary: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
    errors: number;
  };
  playbackSessionSummary: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
    errors: number;
  };
  jobs: Array<{
    id: string;
    status: string;
    library_name: string | null;
  }>;
  playbackSessions: Array<{
    playback_session_id: string;
    status: string;
    pipeline: string | null;
    media_title: string | null;
    file_basename: string | null;
    start_time_seconds: number;
    last_heartbeat_at: string | null;
    last_segment_request_at: string | null;
    last_segment_name: string | null;
    last_segment_index: number | null;
    error_message: string | null;
  }>;
  errors: Array<{
    scan_job_id: string;
    library_name: string | null;
    message: string;
  }>;
};

async function expectRedirect(operation: unknown, location: string) {
  try {
    await operation;
    throw new Error(`Expected redirect to ${location}.`);
  } catch (error) {
    expect(error).toMatchObject({
      status: 303,
      location,
    });
  }
}

describe("jobs page server", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-jobs-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const now = new Date().toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Playback User",
        email: "playback@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      })
      .execute();
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
      .insertInto("media_item")
      .values({
        id: "movie-1",
        kind: "movie",
        title: "Movie",
        sort_title: "movie",
        year: 2026,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2026-01-01",
        provider: null,
        provider_id: null,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "file-1",
        library_id: "library-1",
        media_item_id: "movie-1",
        path: path.join(tempDir, "Movie.2026.mkv"),
        basename: "Movie.2026.mkv",
        extension: ".mkv",
        size_bytes: 100,
        mtime_ms: Date.now(),
        duration_seconds: null,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "matroska",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("scan_job")
      .values([
        {
          id: "completed-job",
          library_id: "library-1",
          status: "completed",
          started_at: now,
          finished_at: now,
          files_seen: 1,
          files_added: 1,
          files_updated: 0,
          errors_count: 2,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "running-job",
          library_id: "library-1",
          status: "running",
          started_at: now,
          finished_at: null,
          files_seen: 2,
          files_added: 0,
          files_updated: 1,
          errors_count: 0,
          created_at: "2026-01-02T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
        {
          id: "failed-job",
          library_id: "library-1",
          status: "failed",
          started_at: now,
          finished_at: now,
          files_seen: 0,
          files_added: 0,
          files_updated: 0,
          errors_count: 1,
          created_at: "2026-01-03T00:00:00.000Z",
          updated_at: "2026-01-03T00:00:00.000Z",
        },
      ])
      .execute();
    await db
      .insertInto("scan_job_error")
      .values({
        scan_job_id: "completed-job",
        path: path.join(tempDir, "Broken.Movie.2026.mkv"),
        message: "Could not read file.",
        created_at: now,
      })
      .execute();
    await db
      .insertInto("playback_session")
      .values([
        {
          id: "completed-transcode",
          media_file_id: "file-1",
          user_id: "user-1",
          status: "completed",
          mode: "transcode",
          pipeline: "request_driven",
          error_message: null,
          start_time_seconds: 120,
          last_heartbeat_at: "2026-01-04T00:01:00.000Z",
          last_segment_request_at: "2026-01-04T00:01:02.000Z",
          last_segment_name: "segment-00030.ts",
          last_segment_index: 30,
          started_at: now,
          finished_at: now,
          created_at: "2026-01-04T00:00:00.000Z",
          updated_at: "2026-01-04T00:00:00.000Z",
        },
        {
          id: "failed-transcode",
          media_file_id: "file-1",
          user_id: "user-1",
          status: "failed",
          mode: "transcode",
          pipeline: "request_driven",
          error_message: "Transcode session failed to start.",
          start_time_seconds: 0,
          last_heartbeat_at: null,
          last_segment_request_at: null,
          last_segment_name: null,
          last_segment_index: null,
          started_at: now,
          finished_at: now,
          created_at: "2026-01-05T00:00:00.000Z",
          updated_at: "2026-01-05T00:00:00.000Z",
        },
      ])
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests?.();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("loads scan job summary, recent jobs, and recent errors for admins", async () => {
    const result = (await load({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never)) as JobsLoadResult;

    expect(result.summary).toEqual({
      total: 3,
      active: 1,
      completed: 1,
      failed: 1,
      cancelled: 0,
      errors: 3,
    });
    expect(result.playbackSessionSummary).toEqual({
      total: 2,
      active: 0,
      completed: 1,
      failed: 1,
      cancelled: 0,
      errors: 1,
    });
    expect(result.jobs.map((job) => job.id)).toEqual([
      "failed-job",
      "running-job",
      "completed-job",
    ]);
    expect(
      result.playbackSessions.map((job) => job.playback_session_id),
    ).toEqual(["failed-transcode", "completed-transcode"]);
    expect(result.playbackSessions[0]).toMatchObject({
      playback_session_id: "failed-transcode",
      status: "failed",
      pipeline: "request_driven",
      media_title: "Movie",
      file_basename: "Movie.2026.mkv",
      start_time_seconds: 0,
      last_heartbeat_at: null,
      last_segment_request_at: null,
      last_segment_name: null,
      last_segment_index: null,
      error_message: "Playback session failed to start.",
    });
    expect(result.playbackSessions[0]).not.toHaveProperty("id");
    expect(result.playbackSessions[0]).not.toHaveProperty("output_path");
    expect(result.playbackSessions[1]).toMatchObject({
      playback_session_id: "completed-transcode",
      start_time_seconds: 120,
      pipeline: "request_driven",
      last_heartbeat_at: "2026-01-04T00:01:00.000Z",
      last_segment_request_at: "2026-01-04T00:01:02.000Z",
      last_segment_name: "segment-00030.ts",
      last_segment_index: 30,
    });
    expect(result.playbackSessions[1]).not.toHaveProperty("id");
    expect(result.playbackSessions[1]).not.toHaveProperty("output_path");
    expect(result.jobs[0]).toMatchObject({
      status: "failed",
      library_name: "Movies",
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      scan_job_id: "completed-job",
      library_name: "Movies",
      message: "Could not read file.",
    });
  });

  test("rejects non-admin jobs page loads", async () => {
    await expectRejectsToMatchObject(
      load({
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      {
        status: 403,
        body: {
          message: "Admin access required",
        },
      },
    );
  });

  test("cancels queued scan jobs through the admin action", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("library")
      .values({
        id: "library-2",
        name: "More Movies",
        kind: "movie",
        path: path.join(tempDir, "more"),
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("scan_job")
      .values({
        id: "queued-job",
        library_id: "library-2",
        status: "queued",
        started_at: null,
        finished_at: null,
        files_seen: 0,
        files_added: 0,
        files_updated: 0,
        errors_count: 0,
        created_at: "2026-01-04T00:00:00.000Z",
        updated_at: "2026-01-04T00:00:00.000Z",
      })
      .execute();

    const form = new FormData();
    form.set("jobId", "queued-job");
    await expectRedirect(
      actions.cancel({
        request: new Request("http://localhost/jobs", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/jobs",
    );

    const job = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("id", "=", "queued-job")
      .executeTakeFirstOrThrow();
    expect(job.status).toBe("cancelled");
    expect(job.finished_at).not.toBeNull();
  });

  test("cancels active playback sessions through the admin action", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("playback_session")
      .values({
        id: "running-transcode",
        media_file_id: "file-1",
        user_id: "user-1",
        status: "running",
        mode: "transcode",
        error_message: null,
        start_time_seconds: 0,
        last_heartbeat_at: null,
        last_segment_request_at: null,
        last_segment_name: null,
        last_segment_index: null,
        started_at: now,
        finished_at: null,
        created_at: "2026-01-06T00:00:00.000Z",
        updated_at: "2026-01-06T00:00:00.000Z",
      })
      .execute();

    const form = new FormData();
    form.set("sessionId", "running-transcode");
    await expectRedirect(
      actions.cancelPlaybackSession({
        request: new Request("http://localhost/jobs?/cancelPlaybackSession", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/jobs",
    );

    const job = await db
      .selectFrom("playback_session")
      .select(["status", "error_message", "finished_at"])
      .where("id", "=", "running-transcode")
      .executeTakeFirstOrThrow();
    expect(job.status).toBe("cancelled");
    expect(job.error_message).toBe("Playback session was cancelled.");
    expect(job.finished_at).not.toBeNull();
  });
});
