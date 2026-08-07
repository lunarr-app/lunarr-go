import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { sql, type Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { createLibrary } from "../libraries";
import type { MovieMetadataMatcher } from "../metadata/matching";
import { movieRows } from "../media/movies/browse";
import { getMovieDetail } from "../media/movies/detail";
import { getPlaybackDecision, saveProgress } from "../playback";
import { getServerStatus } from "../status";
import type { LibraryStorage } from "../storage";
import { setTranscodeBackendForTests } from "../transcoding/manager";
import { createScanJob, runScanJob } from "./index";

let tempDir: string;
let db: Kysely<Database>;
let library: { id: string };

const matcher: MovieMetadataMatcher = async (title, year) => {
  if (title === "Unavailable Movie") {
    throw new Error("TMDb unavailable for Unavailable Movie");
  }

  if (title !== "The Matrix") return null;

  return {
    provider: "tmdb",
    providerId: "603",
    title,
    year,
    overview: "A hacker discovers the nature of reality.",
    runtimeSeconds: 8160,
    posterPath: "/matrix.jpg",
    backdropPath: "/matrix-backdrop.jpg",
    releaseDate: "1999-03-31",
    popularity: 100,
    voteAverage: 8.3,
    genres: [{ providerId: "878", name: "Science Fiction" }],
    videos: [
      {
        providerId: "trailer-1",
        name: "Official Trailer",
        site: "YouTube",
        key: "abc123",
        type: "Trailer",
        official: true,
        publishedAt: "1999-02-01T00:00:00.000Z",
      },
    ],
  };
};
beforeAll(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-scanner-"));
  const mediaDir = path.join(tempDir, "movies");
  await mkdir(mediaDir);
  await writeFile(path.join(mediaDir, "The.Matrix.1999.mkv"), "matrix");
  await writeFile(path.join(mediaDir, "The.Matrix.1999.en.vtt"), "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n");
  await writeFile(path.join(mediaDir, "Unavailable.Movie.2020.mp4"), "metadata error");
  await writeFile(path.join(mediaDir, "notes.txt"), "not media");

  await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
  await migrateDatabase();
  db = await getDb();

  library = await createLibrary({
    name: "Movies",
    kind: "movie",
    path: mediaDir,
  });
});

afterAll(async () => {
  await closeDatabaseForTests();
  await rm(tempDir, { recursive: true, force: true });
});

describe("runScanJob", () => {
  test("scans media files, enriches metadata, records per-file errors, and avoids duplicates", async () => {
    const firstJobId = await createScanJob(library.id);
    await runScanJob(firstJobId, { metadataMatcher: matcher });

    const firstJob = await db.selectFrom("scan_job").selectAll().where("id", "=", firstJobId).executeTakeFirstOrThrow();
    expect(firstJob).toMatchObject({
      status: "completed",
      files_seen: 2,
      files_added: 2,
      files_updated: 0,
      errors_count: 1,
    });

    const files = await db.selectFrom("media_file").selectAll().orderBy("basename").execute();
    expect(files.map((file) => file.basename)).toEqual(["The.Matrix.1999.mkv", "Unavailable.Movie.2020.mp4"]);
    expect(files.map((file) => file.container)).toEqual(["mkv", "mp4"]);

    const matrix = await db
      .selectFrom("media_item")
      .selectAll()
      .where("provider", "=", "tmdb")
      .where("provider_id", "=", "603")
      .executeTakeFirstOrThrow();
    expect(matrix).toMatchObject({
      title: "The Matrix",
      year: 1999,
      poster_path: "/matrix.jpg",
      runtime_seconds: 8160,
      popularity: 100,
      vote_average: 8.3,
    });
    expect(
      await db.selectFrom("media_item_genre").select(["name"]).where("media_item_id", "=", matrix.id).execute(),
    ).toEqual([{ name: "Science Fiction" }]);
    expect(
      await db
        .selectFrom("media_item_video")
        .select(["name", "site", "video_key", sql<number>`official`.as("official")])
        .where("media_item_id", "=", matrix.id)
        .execute(),
    ).toEqual([
      {
        name: "Official Trailer",
        site: "YouTube",
        video_key: "abc123",
        official: 1,
      },
    ]);

    const fallback = await db
      .selectFrom("media_item")
      .selectAll()
      .where("title", "=", "Unavailable Movie")
      .executeTakeFirstOrThrow();
    expect(fallback).toMatchObject({
      provider: null,
      provider_id: null,
      poster_path: null,
      year: 2020,
    });

    const errors = await db.selectFrom("scan_job_error").selectAll().where("scan_job_id", "=", firstJobId).execute();
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toEndWith("Unavailable.Movie.2020.mp4");
    expect(errors[0].message).toBe("TMDb unavailable for Unavailable Movie");

    const secondJobId = await createScanJob(library.id);
    await runScanJob(secondJobId, { metadataMatcher: matcher });

    const secondJob = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("id", "=", secondJobId)
      .executeTakeFirstOrThrow();
    expect(secondJob).toMatchObject({
      status: "completed",
      files_seen: 2,
      files_added: 0,
      files_updated: 0,
      errors_count: 1,
    });

    const fileCount = await db.selectFrom("media_file").select("id").execute();
    const itemCount = await db.selectFrom("media_item").select("id").execute();
    expect(fileCount).toHaveLength(2);
    expect(itemCount).toHaveLength(2);

    const matrixFile = await db
      .selectFrom("media_file")
      .selectAll()
      .where("media_item_id", "=", matrix.id)
      .executeTakeFirstOrThrow();
    const now = Date.now();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await saveProgress({
      userId: "user-1",
      mediaItemId: matrix.id,
      mediaFileId: matrixFile.id,
      positionSeconds: 60,
      durationSeconds: 120,
      completed: false,
    });

    const rows = await movieRows("user-1", "matrix");
    expect(rows.all).toHaveLength(1);
    expect(rows.all[0]).toMatchObject({
      title: "The Matrix",
      posterUrl: "https://image.tmdb.org/t/p/w342/matrix.jpg",
      progressSeconds: 60,
      durationSeconds: 120,
      completed: false,
    });
    expect(rows.continueWatching.map((movie) => movie.id)).toEqual([matrix.id]);

    await db
      .insertInto("media_item")
      .values({
        id: "orphan-movie",
        kind: "movie",
        title: "Metadata Only",
        sort_title: "metadata only",
        year: 2024,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2024-01-01",
        provider: null,
        provider_id: null,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      })
      .execute();

    const rowsWithOrphan = await movieRows("user-1");
    expect(rowsWithOrphan.all.map((movie) => movie.title)).not.toContain("Metadata Only");
    await db.deleteFrom("media_item").where("id", "=", "orphan-movie").execute();

    const detail = await getMovieDetail(matrix.id, "user-1");
    expect(detail?.posterUrl).toBe("https://image.tmdb.org/t/p/w500/matrix.jpg");
    expect(detail?.backdropUrl).toBe("https://image.tmdb.org/t/p/w1280/matrix-backdrop.jpg");
    expect(detail?.genres).toEqual(["Science Fiction"]);
    expect(detail?.progress[0]).toMatchObject({
      media_file_id: matrixFile.id,
      position_seconds: 60,
      duration_seconds: 120,
      completed: 0,
    });
    expect(Object.hasOwn(detail?.files[0] ?? {}, "path")).toBe(false);

    const subtitles = await db.selectFrom("subtitle_track").selectAll().execute();
    expect(subtitles).toHaveLength(1);
    expect(subtitles[0]).toMatchObject({
      media_item_id: matrix.id,
      media_file_id: matrixFile.id,
      label: "en",
      language: "en",
      source_kind: "external",
      mime_type: "text/vtt",
      is_default: 1,
    });
    expect(subtitles[0].path).toEndWith("/movies/The.Matrix.1999.en.vtt");

    setTranscodeBackendForTests({
      async cancel() {
        return;
      },
    });
    try {
      const playback = await getPlaybackDecision(matrix.id, null, "user-1");
      expect(playback).toMatchObject({
        mode: "unavailable",
        status: "unavailable",
        streamUrl: null,
        message: "Request-driven HLS requires known media duration.",
        tracks: [
          {
            id: subtitles[0].id,
            label: "en",
            language: "en",
            src: `/media/subtitles/${subtitles[0].id}`,
            default: true,
          },
        ],
      });
    } finally {
      setTranscodeBackendForTests(null);
    }

    const status = await getServerStatus();
    expect(status).toMatchObject({
      libraries: 1,
      mediaFiles: 2,
      movies: 2,
      matchedMovies: 1,
      moviesWithPosters: 1,
      scanJobs: 2,
      activeScanJobs: 0,
      scanErrors: 2,
    });
    expect(status.dataDir).toBe(path.join(tempDir, "data"));
    expect(status.dbFile).toBe(path.join(tempDir, "data", "lunarr.db"));
    expect(status.lastScan?.status).toBe("completed");

    const fallbackFile = await db
      .selectFrom("media_file")
      .selectAll()
      .where("basename", "=", "Unavailable.Movie.2020.mp4")
      .executeTakeFirstOrThrow();
    await saveProgress({
      userId: "user-1",
      mediaItemId: fallback.id,
      mediaFileId: fallbackFile.id,
      positionSeconds: 25,
      durationSeconds: 100,
      completed: false,
    });

    const repairedMatcher: MovieMetadataMatcher = async (title, year) => {
      if (title !== "Unavailable Movie") return matcher(title, year);

      return {
        provider: "tmdb",
        providerId: "2020",
        title,
        year,
        overview: "A movie that matched after credentials were fixed.",
        runtimeSeconds: 6000,
        posterPath: "/unavailable.jpg",
        backdropPath: "/unavailable-backdrop.jpg",
        releaseDate: "2020-01-01",
        popularity: 10,
        voteAverage: 6.5,
      };
    };
    await db
      .insertInto("media_item")
      .values({
        id: "provider-unavailable",
        kind: "movie",
        title: "Unavailable Movie",
        sort_title: "unavailable movie",
        year: 2020,
        overview: "Existing provider metadata.",
        runtime_seconds: 6000,
        poster_path: "/unavailable.jpg",
        backdrop_path: "/unavailable-backdrop.jpg",
        release_date: "2020-01-01",
        provider: "tmdb",
        provider_id: "2020",
        parent_id: null,
        popularity: 10,
        vote_average: 6.5,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      })
      .execute();
    const repairedJobId = await createScanJob(library.id);
    await runScanJob(repairedJobId, { metadataMatcher: repairedMatcher });

    const repairedJob = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("id", "=", repairedJobId)
      .executeTakeFirstOrThrow();
    expect(repairedJob).toMatchObject({
      status: "completed",
      files_seen: 2,
      files_added: 0,
      files_updated: 1,
      errors_count: 0,
    });

    const repairedMovie = await db
      .selectFrom("media_item")
      .selectAll()
      .where("provider", "=", "tmdb")
      .where("provider_id", "=", "2020")
      .executeTakeFirstOrThrow();
    const repairedFile = await db
      .selectFrom("media_file")
      .selectAll()
      .where("id", "=", fallbackFile.id)
      .executeTakeFirstOrThrow();
    expect(repairedFile.media_item_id).toBe(repairedMovie.id);

    const repairedProgress = await db
      .selectFrom("watch_progress")
      .selectAll()
      .where("user_id", "=", "user-1")
      .where("media_item_id", "=", repairedMovie.id)
      .where("media_file_id", "=", fallbackFile.id)
      .executeTakeFirstOrThrow();
    expect(repairedProgress).toMatchObject({
      position_seconds: 25,
      duration_seconds: 100,
      completed: 0,
    });

    const staleFallback = await db
      .selectFrom("media_item")
      .select("id")
      .where("id", "=", fallback.id)
      .executeTakeFirst();
    expect(staleFallback).toBeUndefined();

    await db
      .insertInto("media_item")
      .values({
        id: "metadata-only-preserved",
        kind: "movie",
        title: "Metadata Only Preserved",
        sort_title: "metadata only preserved",
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
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      })
      .execute();

    await unlink(path.join(tempDir, "movies", "The.Matrix.1999.en.vtt"));
    await unlink(path.join(tempDir, "movies", "Unavailable.Movie.2020.mp4"));
    const cleanupJobId = await createScanJob(library.id);
    await runScanJob(cleanupJobId, { metadataMatcher: matcher });

    const cleanupJob = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("id", "=", cleanupJobId)
      .executeTakeFirstOrThrow();
    expect(cleanupJob).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_removed: 1,
    });

    const remainingFiles = await db.selectFrom("media_file").select(["basename"]).orderBy("basename").execute();
    expect(remainingFiles.map((file) => file.basename)).toEqual(["The.Matrix.1999.mkv"]);

    const remainingItems = await db.selectFrom("media_item").select(["title"]).orderBy("title").execute();
    expect(remainingItems.map((item) => item.title)).toEqual(["Metadata Only Preserved", "The Matrix"]);

    const remainingSubtitles = await db.selectFrom("subtitle_track").selectAll().execute();
    expect(remainingSubtitles).toHaveLength(0);
  });

  test("records traversal errors without failing the whole scan job", async () => {
    const errorPath = path.join(tempDir, "movies", "unreadable");
    const jobId = await createScanJob(library.id);

    await runScanJob(jobId, {
      async *fileWalker() {
        yield {
          kind: "error",
          path: errorPath,
          error: new Error("EACCES: permission denied"),
        };
      },
    });

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "completed",
      files_seen: 0,
      files_added: 0,
      files_updated: 0,
      errors_count: 1,
    });

    const errors = await db.selectFrom("scan_job_error").selectAll().where("scan_job_id", "=", jobId).execute();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      path: errorPath,
      message: "EACCES: permission denied",
    });
  });

  test("ignores unsupported files even when a custom walker yields them", async () => {
    const mediaDir = path.join(tempDir, "custom-walker-filter");
    await mkdir(mediaDir);
    const moviePath = path.join(mediaDir, "Only.Movie.2025.webm");
    const notePath = path.join(mediaDir, "Only.Movie.2025.txt");
    await writeFile(moviePath, "movie");
    await writeFile(notePath, "notes");

    const filteredLibrary = await createLibrary({
      name: "Custom Walker Filter",
      kind: "movie",
      path: mediaDir,
    });
    let metadataLookups = 0;
    const jobId = await createScanJob(filteredLibrary.id);
    await runScanJob(jobId, {
      metadataMatcher: async () => {
        metadataLookups += 1;
        return null;
      },
      async *fileWalker() {
        yield { kind: "file", path: notePath };
        yield { kind: "file", path: moviePath };
      },
    });

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_added: 1,
      files_updated: 0,
      errors_count: 0,
    });
    expect(metadataLookups).toBe(1);

    const files = await db
      .selectFrom("media_file")
      .select(["basename"])
      .where("library_id", "=", filteredLibrary.id)
      .execute();
    expect(files.map((file) => file.basename)).toEqual(["Only.Movie.2025.webm"]);
  });

  test("caches sidecar directory reads during a scan", async () => {
    const mediaDir = path.join(tempDir, "sidecar-cache");
    await mkdir(mediaDir);
    const firstPath = path.join(mediaDir, "Cache.Movie.Part.One.2025.mp4");
    const secondPath = path.join(mediaDir, "Cache.Movie.Part.Two.2025.mp4");
    await writeFile(firstPath, "first");
    await writeFile(secondPath, "second");

    const cachedLibrary = await createLibrary({
      name: "Sidecar Cache",
      kind: "movie",
      path: mediaDir,
    });
    let directoryReads = 0;
    const jobId = await createScanJob(cachedLibrary.id);
    await runScanJob(jobId, {
      metadataMatcher: async () => null,
      async *fileWalker() {
        yield { kind: "file", path: firstPath };
        yield { kind: "file", path: secondPath };
      },
      directoryFileReader: async (directory) => {
        directoryReads += 1;
        return {
          ok: true,
          paths: [firstPath, secondPath].filter((filePath) => path.dirname(filePath) === directory),
        };
      },
    });

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job.files_seen).toBe(2);
    expect(directoryReads).toBe(1);
  });

  test("keeps existing sidecar subtitle rows when directory listing fails", async () => {
    const mediaDir = path.join(tempDir, "sidecar-read-failure");
    await mkdir(mediaDir);
    const moviePath = path.join(mediaDir, "Sidecar.Keep.2025.mp4");
    const subtitlePath = path.join(mediaDir, "Sidecar.Keep.2025.en.vtt");
    await writeFile(moviePath, "movie");
    await writeFile(subtitlePath, "WEBVTT\n");

    const sidecarLibrary = await createLibrary({
      name: "Sidecar Read Failure",
      kind: "movie",
      path: mediaDir,
    });
    const firstJobId = await createScanJob(sidecarLibrary.id);
    await runScanJob(firstJobId, { metadataMatcher: async () => null });
    const mediaFile = await db
      .selectFrom("media_file")
      .select(["id", "path"])
      .where("library_id", "=", sidecarLibrary.id)
      .executeTakeFirstOrThrow();
    expect(
      await db.selectFrom("subtitle_track").selectAll().where("media_file_id", "=", mediaFile.id).execute(),
    ).toHaveLength(1);

    const secondJobId = await createScanJob(sidecarLibrary.id);
    await runScanJob(secondJobId, {
      metadataMatcher: async () => null,
      async *fileWalker() {
        yield { kind: "file", path: mediaFile.path };
      },
      directoryFileReader: async () => ({ ok: false, paths: [] }),
    });

    expect(
      await db.selectFrom("subtitle_track").selectAll().where("media_file_id", "=", mediaFile.id).execute(),
    ).toHaveLength(1);
  });

  test("scans remote-like SFTP paths through the storage adapter", async () => {
    const now = new Date().toISOString();
    const remoteRoot = "/media/movies";
    const remoteDir = "/media/movies/Remote Movie (2026)";
    const remoteFile = `${remoteDir}/Remote.Movie.2026.mp4`;
    const remoteSubtitle = `${remoteDir}/Remote.Movie.2026.en.vtt`;
    await db
      .insertInto("library")
      .values({
        id: "sftp-library",
        name: "SFTP Movies",
        kind: "movie",
        source: "sftp",
        path: "sftp://mediauser@sftp.example.test:22/media/movies",
        config_json: "{}",
        created_at: now,
        updated_at: now,
      })
      .execute();

    const storage: LibraryStorage = {
      source: "sftp",
      root: remoteRoot,
      async statFile(filePath) {
        if (filePath !== remoteFile && filePath !== remoteSubtitle) return null;
        return {
          path: filePath,
          basename: path.posix.basename(filePath),
          extension: path.posix.extname(filePath),
          size: filePath === remoteFile ? 1234 : 42,
          mtimeMs: 1_800_000_000_000,
        };
      },
      async listFiles(directory) {
        throw new Error(`Expected scanner to reuse the walked directory cache instead of listing ${directory}.`);
      },
      async *walkFiles(root) {
        expect(root).toBe(remoteRoot);
        yield {
          kind: "directory",
          path: remoteDir,
          files: [
            {
              path: remoteFile,
              basename: path.posix.basename(remoteFile),
              extension: ".mp4",
              size: 1234,
              mtimeMs: 1_800_000_000_000,
            },
            {
              path: remoteSubtitle,
              basename: path.posix.basename(remoteSubtitle),
              extension: ".vtt",
              size: 42,
              mtimeMs: 1_800_000_000_000,
            },
          ],
        };
        yield {
          kind: "file",
          path: remoteFile,
          file: {
            path: remoteFile,
            basename: path.posix.basename(remoteFile),
            extension: ".mp4",
            size: 1234,
            mtimeMs: 1_800_000_000_000,
          },
        };
      },
      async createReadStream() {
        return Readable.from([]);
      },
      async close() {
        return;
      },
    };

    const jobId = await createScanJob("sftp-library");
    await runScanJob(jobId, {
      storage,
      metadataMatcher: async () => null,
      probeBackend: null,
    });

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_added: 1,
      errors_count: 0,
    });

    const file = await db
      .selectFrom("media_file")
      .selectAll()
      .where("library_id", "=", "sftp-library")
      .executeTakeFirstOrThrow();
    expect(file).toMatchObject({
      path: remoteFile,
      basename: "Remote.Movie.2026.mp4",
      size_bytes: 1234,
    });
    expect(
      await db.selectFrom("subtitle_track").selectAll().where("media_file_id", "=", file.id).execute(),
    ).toHaveLength(1);

    await db.deleteFrom("library").where("id", "=", "sftp-library").execute();
  });

  test("scans remote-like WebDAV paths through the storage adapter", async () => {
    const now = new Date().toISOString();
    const remoteRoot = "/media/movies";
    const remoteDir = "/media/movies/Remote Movie (2026)";
    const remoteFile = `${remoteDir}/Remote.Movie.2026.mp4`;
    const remoteSubtitle = `${remoteDir}/Remote.Movie.2026.en.vtt`;
    await db
      .insertInto("library")
      .values({
        id: "webdav-library",
        name: "WebDAV Movies",
        kind: "movie",
        source: "webdav",
        path: "webdavs://mediauser@nas.example.test/media/movies",
        config_json: "{}",
        created_at: now,
        updated_at: now,
      })
      .execute();

    const storage: LibraryStorage = {
      source: "webdav",
      root: remoteRoot,
      async statFile(filePath) {
        if (filePath !== remoteFile && filePath !== remoteSubtitle) return null;
        return {
          path: filePath,
          basename: path.posix.basename(filePath),
          extension: path.posix.extname(filePath),
          size: filePath === remoteFile ? 1234 : 42,
          mtimeMs: 1_800_000_000_000,
        };
      },
      async listFiles(directory) {
        throw new Error(`Expected scanner to reuse the walked directory cache instead of listing ${directory}.`);
      },
      async *walkFiles(root) {
        expect(root).toBe(remoteRoot);
        yield {
          kind: "directory",
          path: remoteDir,
          files: [
            {
              path: remoteFile,
              basename: path.posix.basename(remoteFile),
              extension: ".mp4",
              size: 1234,
              mtimeMs: 1_800_000_000_000,
            },
            {
              path: remoteSubtitle,
              basename: path.posix.basename(remoteSubtitle),
              extension: ".vtt",
              size: 42,
              mtimeMs: 1_800_000_000_000,
            },
          ],
        };
        yield {
          kind: "file",
          path: remoteFile,
          file: {
            path: remoteFile,
            basename: path.posix.basename(remoteFile),
            extension: ".mp4",
            size: 1234,
            mtimeMs: 1_800_000_000_000,
          },
        };
      },
      async createReadStream() {
        return Readable.from([]);
      },
      async close() {
        return;
      },
    };

    const jobId = await createScanJob("webdav-library");
    await runScanJob(jobId, {
      storage,
      metadataMatcher: async () => null,
      probeBackend: null,
    });

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_added: 1,
      errors_count: 0,
    });

    const file = await db
      .selectFrom("media_file")
      .selectAll()
      .where("library_id", "=", "webdav-library")
      .executeTakeFirstOrThrow();
    expect(file).toMatchObject({
      path: remoteFile,
      basename: "Remote.Movie.2026.mp4",
      size_bytes: 1234,
    });
    expect(
      await db.selectFrom("subtitle_track").selectAll().where("media_file_id", "=", file.id).execute(),
    ).toHaveLength(1);

    await db.deleteFrom("library").where("id", "=", "webdav-library").execute();
  });

  test("keeps existing file rows when a yielded file cannot be processed", async () => {
    const mediaDir = path.join(tempDir, "disappearing-file");
    await mkdir(mediaDir);
    const stalePath = path.join(mediaDir, "Gone.Movie.2026.mp4");
    const now = new Date().toISOString();

    const staleLibrary = await createLibrary({
      name: "Disappearing File",
      kind: "movie",
      path: mediaDir,
    });
    await db
      .insertInto("media_item")
      .values({
        id: "disappearing-movie",
        kind: "movie",
        title: "Gone Movie",
        sort_title: "gone movie",
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
        id: "disappearing-file",
        library_id: staleLibrary.id,
        media_item_id: "disappearing-movie",
        path: stalePath,
        basename: "Gone.Movie.2026.mp4",
        extension: ".mp4",
        size_bytes: 10,
        mtime_ms: Date.now(),
        duration_seconds: null,
        video_codec: null,
        audio_codec: null,
        container: "mp4",
        created_at: now,
        updated_at: now,
      })
      .execute();

    const jobId = await createScanJob(staleLibrary.id);
    await runScanJob(jobId, {
      async *fileWalker() {
        yield { kind: "file", path: stalePath };
      },
    });

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_added: 0,
      files_updated: 0,
      files_removed: 0,
      errors_count: 1,
    });

    const errors = await db.selectFrom("scan_job_error").selectAll().where("scan_job_id", "=", jobId).execute();
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe(stalePath);
    expect(errors[0].message).toContain("Media file is no longer available.");
    expect(
      await db.selectFrom("media_file").select("id").where("id", "=", "disappearing-file").executeTakeFirst(),
    ).toEqual({ id: "disappearing-file" });
    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "disappearing-movie").executeTakeFirst(),
    ).toEqual({ id: "disappearing-movie" });

    await db.deleteFrom("library").where("id", "=", staleLibrary.id).execute();
  });

  test("skips metadata lookup for already matched unchanged files", async () => {
    const mediaDir = path.join(tempDir, "matched-repeat-scan");
    await mkdir(mediaDir);
    await writeFile(path.join(mediaDir, "Primer.2004.mp4"), "primer");

    const matchedLibrary = await createLibrary({
      name: "Matched Repeat",
      kind: "movie",
      path: mediaDir,
    });
    let firstScanLookups = 0;
    const firstScanMatcher: MovieMetadataMatcher = async (title, year) => {
      firstScanLookups += 1;
      expect(title).toBe("Primer");

      return {
        provider: "tmdb",
        providerId: "14337",
        title,
        year,
        overview: "Engineers accidentally discover time travel.",
        runtimeSeconds: 4620,
        posterPath: "/primer.jpg",
        backdropPath: "/primer-backdrop.jpg",
        releaseDate: "2004-10-08",
        popularity: 20,
        voteAverage: 6.9,
      };
    };

    const firstJobId = await createScanJob(matchedLibrary.id);
    await runScanJob(firstJobId, { metadataMatcher: firstScanMatcher });
    const firstJob = await db.selectFrom("scan_job").selectAll().where("id", "=", firstJobId).executeTakeFirstOrThrow();
    expect(firstJob).toMatchObject({
      status: "completed",
      files_added: 1,
      errors_count: 0,
    });
    expect(firstScanLookups).toBe(1);

    let repeatLookups = 0;
    const repeatMatcher: MovieMetadataMatcher = async () => {
      repeatLookups += 1;
      throw new Error("repeat scan should not query already matched unchanged files");
    };

    const repeatJobId = await createScanJob(matchedLibrary.id);
    await runScanJob(repeatJobId, { metadataMatcher: repeatMatcher });
    const repeatJob = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("id", "=", repeatJobId)
      .executeTakeFirstOrThrow();
    expect(repeatJob).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_added: 0,
      files_updated: 0,
      errors_count: 0,
    });
    expect(repeatLookups).toBe(0);
  });

  test("does not reuse non-movie provider items when matching movie files", async () => {
    const mediaDir = path.join(tempDir, "provider-kind-boundary");
    await mkdir(mediaDir);
    const moviePath = path.join(mediaDir, "The.Matrix.1999.mkv");
    await writeFile(moviePath, "matrix");
    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values({
        id: "show-provider-same-id",
        kind: "show",
        title: "Different Show",
        sort_title: "different show",
        year: 1999,
        overview: "Existing show metadata.",
        runtime_seconds: null,
        poster_path: "/show.jpg",
        backdrop_path: null,
        release_date: "1999-01-01",
        provider: "tmdb",
        provider_id: "603",
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const movieLibrary = await createLibrary({
      name: "Provider Kind Boundary",
      kind: "movie",
      path: mediaDir,
    });
    const jobId = await createScanJob(movieLibrary.id);
    await runScanJob(jobId, { metadataMatcher: matcher });

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "completed",
      files_added: 1,
      errors_count: 0,
    });

    const show = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", "show-provider-same-id")
      .executeTakeFirstOrThrow();
    expect(show).toMatchObject({
      kind: "show",
      title: "Different Show",
      provider: "tmdb",
      provider_id: "603",
      poster_path: "/show.jpg",
    });

    const scannedMovie = await db
      .selectFrom("media_file")
      .innerJoin("media_item", "media_item.id", "media_file.media_item_id")
      .select([
        "media_file.media_item_id",
        "media_item.kind",
        "media_item.title",
        "media_item.provider",
        "media_item.provider_id",
        "media_item.poster_path",
      ])
      .where("media_file.library_id", "=", movieLibrary.id)
      .where("media_file.basename", "=", "The.Matrix.1999.mkv")
      .executeTakeFirstOrThrow();
    expect(scannedMovie).toMatchObject({
      kind: "movie",
      title: "The Matrix",
      provider: "tmdb",
      provider_id: "603",
      poster_path: "/matrix.jpg",
    });
    expect(scannedMovie.media_item_id).not.toBe("show-provider-same-id");
  });

  test("uses Radarr movie folder metadata before noisy release filenames", async () => {
    const mediaDir = path.join(tempDir, "radarr-folder-metadata");
    const movieDir = path.join(mediaDir, "Blade Runner (1982)");
    await mkdir(movieDir, { recursive: true });
    await writeFile(path.join(movieDir, "Blade.Runner (1997).mp4"), "blade");

    const movieLibrary = await createLibrary({
      name: "Radarr Folder Metadata",
      kind: "movie",
      path: mediaDir,
    });
    const calls: Array<{ title: string; year: number | null }> = [];
    const jobId = await createScanJob(movieLibrary.id);
    await runScanJob(jobId, {
      metadataMatcher: async (title, year) => {
        calls.push({ title, year });
        expect({ title, year }).toEqual({
          title: "Blade Runner",
          year: 1982,
        });
        return {
          provider: "tmdb",
          providerId: "78",
          title: "Blade Runner",
          year: 1982,
          overview: "A blade runner must pursue replicants.",
          runtimeSeconds: 7020,
          posterPath: "/blade-runner.jpg",
          backdropPath: "/blade-runner-backdrop.jpg",
          releaseDate: "1982-06-25",
          popularity: 60,
          voteAverage: 7.9,
        };
      },
    });

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "completed",
      files_added: 1,
      errors_count: 0,
    });
    expect(calls).toEqual([{ title: "Blade Runner", year: 1982 }]);

    const scannedMovie = await db
      .selectFrom("media_file")
      .innerJoin("media_item", "media_item.id", "media_file.media_item_id")
      .select([
        "media_item.title",
        "media_item.year",
        "media_item.provider",
        "media_item.provider_id",
        "media_item.poster_path",
      ])
      .where("media_file.library_id", "=", movieLibrary.id)
      .executeTakeFirstOrThrow();
    expect(scannedMovie).toMatchObject({
      title: "Blade Runner",
      year: 1982,
      provider: "tmdb",
      provider_id: "78",
      poster_path: "/blade-runner.jpg",
    });
  });

  test("does not use a year-like library root as movie metadata", async () => {
    const mediaDir = path.join(tempDir, "Movies (2026)");
    await mkdir(mediaDir, { recursive: true });
    await writeFile(path.join(mediaDir, "The Matrix (1999).mkv"), "matrix");

    const movieLibrary = await createLibrary({
      name: "Year Root",
      kind: "movie",
      path: mediaDir,
    });
    const calls: Array<{ title: string; year: number | null }> = [];
    const jobId = await createScanJob(movieLibrary.id);
    await runScanJob(jobId, {
      metadataMatcher: async (title, year) => {
        calls.push({ title, year });
        if (title !== "The Matrix") return null;
        return {
          provider: "tmdb",
          providerId: "603",
          title,
          year,
          overview: "A hacker discovers the nature of reality.",
          runtimeSeconds: 8160,
          posterPath: "/matrix.jpg",
          backdropPath: "/matrix-backdrop.jpg",
          releaseDate: "1999-03-31",
          popularity: 100,
          voteAverage: 8.3,
        };
      },
    });

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job.status).toBe("completed");
    expect(calls).toEqual([{ title: "The Matrix", year: 1999 }]);

    const scannedMovie = await db
      .selectFrom("media_file")
      .innerJoin("media_item", "media_item.id", "media_file.media_item_id")
      .select(["media_item.title", "media_item.year", "media_item.provider_id"])
      .where("media_file.library_id", "=", movieLibrary.id)
      .executeTakeFirstOrThrow();
    expect(scannedMovie).toEqual({
      title: "The Matrix",
      year: 1999,
      provider_id: "603",
    });
  });

  test("keeps same-title local movies separate when one filename has no year", async () => {
    const mediaDir = path.join(tempDir, "same-title-movies");
    await mkdir(mediaDir);
    const datedMovie = path.join(mediaDir, "King.Kong.1933.mp4");
    const undatedMovie = path.join(mediaDir, "King Kong.mp4");
    await writeFile(datedMovie, "dated");
    await writeFile(undatedMovie, "undated");

    const sameTitleLibrary = await createLibrary({
      name: "Same Title",
      kind: "movie",
      path: mediaDir,
    });
    const jobId = await createScanJob(sameTitleLibrary.id);
    await runScanJob(jobId, {
      metadataMatcher: async () => null,
      async *fileWalker() {
        yield { kind: "file", path: datedMovie };
        yield { kind: "file", path: undatedMovie };
      },
    });

    const movies = await db
      .selectFrom("media_item")
      .select(["id", "title", "year"])
      .where("title", "=", "King Kong")
      .orderBy("year", "asc")
      .execute();
    expect(movies).toHaveLength(2);
    expect(movies.map((movie) => movie.year)).toEqual([null, 1933]);

    const files = await db
      .selectFrom("media_file")
      .select(["basename", "media_item_id"])
      .where("library_id", "=", sameTitleLibrary.id)
      .orderBy("basename", "asc")
      .execute();
    expect(new Set(files.map((file) => file.media_item_id)).size).toBe(2);
  });
});
