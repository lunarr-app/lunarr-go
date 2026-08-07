import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "./db";
import type { Database } from "./db/schema";
import { createLibrary } from "./libraries";
import { movieRows } from "./media/movies/browse";
import { getMovieDetail } from "./media/movies/detail";
import { mediaStreamResponse } from "./media/stream";
import type { MatchedMovieMetadata } from "./metadata/tmdb";
import { getPlaybackDecision, saveProgress } from "./playback";
import { startScan } from "./scanner/scan-jobs";
import { getServerStatus } from "./status";

describe("local movie library MVP workflow", () => {
  let tempDir: string;
  let mediaDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-mvp-workflow-"));
    mediaDir = path.join(tempDir, "Movies");
    await mkdir(mediaDir);

    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "MVP User",
        email: "mvp@example.com",
        role: "admin",
        email_verified: 0,
        image: null,
        created_at: nowMs,
        updated_at: nowMs,
      })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  async function waitForScan(jobId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
      if (job.status !== "queued" && job.status !== "running") return job;
      await Bun.sleep(25);
    }

    throw new Error("Scan job did not finish.");
  }

  test("scans a local folder, enriches a movie, streams a range, and resumes progress", async () => {
    await writeFile(path.join(mediaDir, "The.Matrix.1999.mp4"), "0123456789");

    const metadataMatcher = async (title: string, year: number | null): Promise<MatchedMovieMetadata | null> => {
      if (title !== "The Matrix" || year !== 1999) return null;

      return {
        provider: "tmdb",
        providerId: "603",
        title: "The Matrix",
        year: 1999,
        overview: "A computer hacker learns about the true nature of his reality.",
        runtimeSeconds: 8160,
        posterPath: "/matrix.jpg",
        backdropPath: "/matrix-backdrop.jpg",
        releaseDate: "1999-03-31",
        popularity: 80,
        voteAverage: 8.2,
        genres: [{ providerId: "878", name: "Science Fiction" }],
      };
    };

    const library = await createLibrary({
      name: "Movies",
      kind: "movie",
      path: mediaDir,
    });
    const jobId = await startScan(library.id, { metadataMatcher });
    const job = await waitForScan(jobId);

    expect(job).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_added: 1,
      files_updated: 0,
      files_removed: 0,
      errors_count: 0,
    });

    const rows = await movieRows("user-1", "matrix", "all", "rating");
    expect(rows.all).toHaveLength(1);
    expect(rows.all[0]).toMatchObject({
      title: "The Matrix",
      year: 1999,
      posterUrl: "https://image.tmdb.org/t/p/w342/matrix.jpg",
      completed: false,
      progressSeconds: 0,
    });

    const detail = await getMovieDetail(rows.all[0].id, "user-1");
    expect(detail).toMatchObject({
      movie: {
        title: "The Matrix",
        overview: "A computer hacker learns about the true nature of his reality.",
        runtime_seconds: 8160,
      },
      posterUrl: "https://image.tmdb.org/t/p/w500/matrix.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/w1280/matrix-backdrop.jpg",
      genres: ["Science Fiction"],
    });
    expect(detail?.files).toHaveLength(1);

    const playback = await getPlaybackDecision(rows.all[0].id);
    expect(playback).toMatchObject({
      mode: "direct",
      file: {
        basename: "The.Matrix.1999.mp4",
        extension: ".mp4",
      },
    });
    expect(playback?.streamUrl).toBe(`/media/files/${playback?.file.id}/stream`);

    const rangeResponse = await mediaStreamResponse(playback!.file.id, "user-1", "bytes=2-5");
    expect(rangeResponse.status).toBe(206);
    expect(rangeResponse.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await rangeResponse.text()).toBe("2345");

    await saveProgress({
      userId: "user-1",
      mediaItemId: rows.all[0].id,
      mediaFileId: playback!.file.id,
      positionSeconds: 60,
      durationSeconds: 100,
      completed: false,
    });

    const afterProgress = await movieRows("user-1");
    expect(afterProgress.continueWatching[0]).toMatchObject({
      id: rows.all[0].id,
      resumeFileId: playback!.file.id,
      progressSeconds: 60,
      durationSeconds: 100,
      completed: false,
    });

    expect(await getServerStatus()).toMatchObject({
      libraries: 1,
      mediaFiles: 1,
      movies: 1,
      matchedMovies: 1,
      moviesWithPosters: 1,
      scanJobs: 1,
      activeScanJobs: 0,
      scanErrors: 0,
    });
  });
});
