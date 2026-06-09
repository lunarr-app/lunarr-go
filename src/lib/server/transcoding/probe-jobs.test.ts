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
import type { ProbeBackend } from "./backend";
import { startMediaProbeRefreshJob } from "./probe-jobs";

async function waitForProbeJob(db: Kysely<Database>, jobId: string) {
  let job = await db
    .selectFrom("scan_job")
    .selectAll()
    .where("id", "=", jobId)
    .executeTakeFirstOrThrow();
  for (
    let index = 0;
    index < 50 && (job.status === "queued" || job.status === "running");
    index += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    job = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("id", "=", jobId)
      .executeTakeFirstOrThrow();
  }
  return job;
}

describe("media probe refresh jobs", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-probe-jobs-"));
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
      .insertInto("media_item")
      .values({
        id: "movie-1",
        kind: "movie",
        title: "Probe Movie",
        sort_title: "probe movie",
        year: 2026,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: null,
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
        path: path.join(tempDir, "Probe.Movie.2026.mp4"),
        basename: "Probe.Movie.2026.mp4",
        extension: ".mp4",
        size_bytes: 1024,
        mtime_ms: Date.now(),
        duration_seconds: null,
        video_codec: null,
        audio_codec: null,
        container: "mp4",
        created_at: now,
        updated_at: now,
      })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("backfills missing media probe metadata", async () => {
    const probeBackend: ProbeBackend = {
      async probe(input) {
        expect(input.mediaFileId).toBe("file-1");
        return {
          container: "mov,mp4,m4a,3gp,3g2,mj2",
          durationSeconds: 42,
          bitRate: 1_000_000,
          streams: [
            {
              index: 0,
              type: "video",
              codecName: "h264",
              codecLongName: "H.264 / AVC",
              language: null,
              title: null,
              width: 1280,
              height: 720,
              channels: null,
              sampleRate: null,
              durationSeconds: 42,
              bitRate: 900_000,
              raw: null,
            },
            {
              index: 1,
              type: "audio",
              codecName: "aac",
              codecLongName: "AAC",
              language: "en",
              title: null,
              width: null,
              height: null,
              channels: 2,
              sampleRate: 48000,
              durationSeconds: 42,
              bitRate: 100_000,
              raw: null,
            },
          ],
        };
      },
    };

    const job = await startMediaProbeRefreshJob({ probeBackend });
    const completedJob = await waitForProbeJob(db, job.id);
    expect(completedJob).toMatchObject({
      job_kind: "media_probe_refresh",
      status: "completed",
      files_seen: 1,
      files_updated: 1,
      errors_count: 0,
    });
    expect(
      await db
        .selectFrom("media_file")
        .selectAll()
        .where("id", "=", "file-1")
        .executeTakeFirstOrThrow(),
    ).toMatchObject({
      duration_seconds: 42,
      video_codec: "h264",
      audio_codec: "aac",
      container: "mp4",
    });
    expect(
      await db
        .selectFrom("media_stream_info")
        .selectAll()
        .where("media_file_id", "=", "file-1")
        .execute(),
    ).toHaveLength(2);
  });
});
