import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { refreshMovieMetadataResult, runMovieMetadataRefreshJob } from "./movies";
import type { MatchedMovieMetadata } from "./tmdb";

let tempDir: string;
let db: Kysely<Database>;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-metadata-"));

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
      title: "Local Title",
      sort_title: "local title",
      year: 1999,
      overview: null,
      runtime_seconds: null,
      poster_path: null,
      backdrop_path: null,
      release_date: "1999-01-01",
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
      path: path.join(tempDir, "The.Matrix.1999.mkv"),
      basename: "The.Matrix.1999.mkv",
      extension: ".mkv",
      size_bytes: 10,
      mtime_ms: Date.now(),
      duration_seconds: null,
      video_codec: null,
      audio_codec: null,
      container: "mkv",
      created_at: now,
      updated_at: now,
    })
    .execute();
});

afterEach(async () => {
  await closeDatabaseForTests();
  await rm(tempDir, { recursive: true, force: true });
});

describe("refreshMovieMetadata", () => {
  test("refreshes stored movie metadata using the best parsed filename title", async () => {
    const calls: Array<{ title: string; year: number | null }> = [];
    const matcher = async (title: string, year: number | null): Promise<MatchedMovieMetadata | null> => {
      calls.push({ title, year });
      return {
        provider: "tmdb",
        providerId: "603",
        title: "The Matrix",
        year,
        overview: "A hacker discovers the nature of reality.",
        runtimeSeconds: 8160,
        posterPath: "/matrix.jpg",
        backdropPath: "/matrix-backdrop.jpg",
        releaseDate: "1999-03-31",
        popularity: 100,
        voteAverage: 8.3,
        genres: [{ providerId: "28", name: "Action" }],
      };
    };

    expect(
      await refreshMovieMetadataResult("movie-1", {
        metadataMatcher: matcher,
      }).then((result) => result.status),
    ).toBe("matched");
    expect(calls).toEqual([{ title: "The Matrix", year: 1999 }]);

    const movie = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-1").executeTakeFirstOrThrow();
    expect(movie).toMatchObject({
      title: "The Matrix",
      sort_title: "matrix",
      provider: "tmdb",
      provider_id: "603",
      poster_path: "/matrix.jpg",
      runtime_seconds: 8160,
    });
    expect(
      await db.selectFrom("media_item_genre").select(["name"]).where("media_item_id", "=", "movie-1").execute(),
    ).toEqual([{ name: "Action" }]);
  });

  test("refreshes movie metadata using Radarr parent folder title and year", async () => {
    await db
      .updateTable("media_file")
      .set({
        path: path.join(tempDir, "Blade Runner (1982)", "Blade.Runner (1997).mp4"),
        basename: "Blade.Runner (1997).mp4",
      })
      .where("id", "=", "file-1")
      .execute();

    const calls: Array<{ title: string; year: number | null }> = [];
    const matcher = async (title: string, year: number | null): Promise<MatchedMovieMetadata | null> => {
      calls.push({ title, year });
      return {
        provider: "tmdb",
        providerId: "78",
        title: "Blade Runner",
        year,
        overview: "A blade runner must pursue replicants.",
        runtimeSeconds: 7020,
        posterPath: "/blade-runner.jpg",
        backdropPath: "/blade-runner-backdrop.jpg",
        releaseDate: "1982-06-25",
        popularity: 60,
        voteAverage: 7.9,
      };
    };

    expect(
      await refreshMovieMetadataResult("movie-1", {
        metadataMatcher: matcher,
      }).then((result) => result.status),
    ).toBe("matched");
    expect(calls).toEqual([{ title: "Blade Runner", year: 1982 }]);

    const movie = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-1").executeTakeFirstOrThrow();
    expect(movie).toMatchObject({
      title: "Blade Runner",
      year: 1982,
      provider: "tmdb",
      provider_id: "78",
      poster_path: "/blade-runner.jpg",
    });
  });

  test("refreshes movie metadata from filename when library root contains a year", async () => {
    const libraryRoot = path.join(tempDir, "Movies (2026)");
    await db.updateTable("library").set({ path: libraryRoot }).where("id", "=", "library-1").execute();
    await db
      .updateTable("media_file")
      .set({
        path: path.join(libraryRoot, "The Matrix (1999).mkv"),
        basename: "The Matrix (1999).mkv",
      })
      .where("id", "=", "file-1")
      .execute();

    const calls: Array<{ title: string; year: number | null }> = [];
    const matcher = async (title: string, year: number | null): Promise<MatchedMovieMetadata | null> => {
      calls.push({ title, year });
      return {
        provider: "tmdb",
        providerId: "603",
        title: "The Matrix",
        year,
        overview: "A hacker discovers the nature of reality.",
        runtimeSeconds: 8160,
        posterPath: "/matrix.jpg",
        backdropPath: "/matrix-backdrop.jpg",
        releaseDate: "1999-03-31",
        popularity: 100,
        voteAverage: 8.3,
      };
    };

    expect(
      await refreshMovieMetadataResult("movie-1", {
        metadataMatcher: matcher,
      }).then((result) => result.status),
    ).toBe("matched");
    expect(calls).toEqual([{ title: "The Matrix", year: 1999 }]);
  });

  test("moves local duplicates onto an existing provider item during refresh", async () => {
    const now = new Date().toISOString();
    const nowMs = Date.now();
    await db
      .insertInto("media_item")
      .values({
        id: "movie-provider",
        kind: "movie",
        title: "The Matrix",
        sort_title: "matrix",
        year: 1999,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "1999-03-31",
        provider: "tmdb",
        provider_id: "603",
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "User",
        email: "user@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: nowMs,
        updated_at: nowMs,
      })
      .execute();
    await db
      .insertInto("watch_progress")
      .values([
        {
          user_id: "user-1",
          media_item_id: "movie-1",
          media_file_id: "file-1",
          position_seconds: 42,
          duration_seconds: 120,
          completed: 0,
          updated_at: now,
        },
        {
          user_id: "user-1",
          media_item_id: "movie-provider",
          media_file_id: "file-1",
          position_seconds: 5,
          duration_seconds: 120,
          completed: 0,
          updated_at: new Date(Date.now() - 1000).toISOString(),
        },
      ])
      .execute();
    await db
      .insertInto("subtitle_track")
      .values({
        id: "subtitle-1",
        media_item_id: "movie-1",
        media_file_id: "file-1",
        label: "English",
        language: "en",
        source_kind: "external",
        path: path.join(tempDir, "The.Matrix.1999.en.vtt"),
        mime_type: "text/vtt",
        is_default: 1,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const status = (
      await refreshMovieMetadataResult("movie-1", {
        metadataMatcher: async () => ({
          provider: "tmdb",
          providerId: "603",
          title: "The Matrix",
          year: 1999,
          overview: "Updated overview",
          runtimeSeconds: 8160,
          posterPath: "/matrix.jpg",
          backdropPath: "/matrix-backdrop.jpg",
          releaseDate: "1999-03-31",
          popularity: 100,
          voteAverage: 8.3,
        }),
      })
    ).status;

    expect(status).toBe("matched");
    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "movie-1").executeTakeFirst(),
    ).toBeUndefined();

    const providerMovie = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", "movie-provider")
      .executeTakeFirstOrThrow();
    expect(providerMovie).toMatchObject({
      overview: "Updated overview",
      poster_path: "/matrix.jpg",
      runtime_seconds: 8160,
    });

    const movedFile = await db
      .selectFrom("media_file")
      .selectAll()
      .where("id", "=", "file-1")
      .executeTakeFirstOrThrow();
    expect(movedFile.media_item_id).toBe("movie-provider");

    const progressRows = await db
      .selectFrom("watch_progress")
      .selectAll()
      .where("media_file_id", "=", "file-1")
      .execute();
    expect(progressRows).toHaveLength(1);
    const movedProgress = progressRows[0];
    expect(movedProgress).toMatchObject({
      media_item_id: "movie-provider",
      position_seconds: 42,
    });

    const movedSubtitle = await db
      .selectFrom("subtitle_track")
      .selectAll()
      .where("id", "=", "subtitle-1")
      .executeTakeFirstOrThrow();
    expect(movedSubtitle).toMatchObject({
      media_item_id: "movie-provider",
      media_file_id: "file-1",
    });
  });

  test("keeps movie refresh separate from non-movie items with the same provider id", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values({
        id: "show-provider",
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

    expect(
      await refreshMovieMetadataResult("movie-1", {
        metadataMatcher: async () => ({
          provider: "tmdb",
          providerId: "603",
          title: "The Matrix",
          year: 1999,
          overview: "Movie metadata.",
          runtimeSeconds: 8160,
          posterPath: "/matrix.jpg",
          backdropPath: "/matrix-backdrop.jpg",
          releaseDate: "1999-03-31",
          popularity: 100,
          voteAverage: 8.3,
        }),
      }).then((result) => result.status),
    ).toBe("matched");

    const show = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", "show-provider")
      .executeTakeFirstOrThrow();
    expect(show).toMatchObject({
      kind: "show",
      title: "Different Show",
      provider: "tmdb",
      provider_id: "603",
      poster_path: "/show.jpg",
    });

    const movie = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-1").executeTakeFirstOrThrow();
    expect(movie).toMatchObject({
      kind: "movie",
      title: "The Matrix",
      provider: "tmdb",
      provider_id: "603",
      poster_path: "/matrix.jpg",
    });
    const file = await db
      .selectFrom("media_file")
      .select(["media_item_id"])
      .where("id", "=", "file-1")
      .executeTakeFirstOrThrow();
    expect(file.media_item_id).toBe("movie-1");
  });

  test("skips metadata-only movie rows during single movie refresh", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values({
        id: "metadata-only",
        kind: "movie",
        title: "Metadata Only",
        sort_title: "metadata only",
        year: 2024,
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

    expect(
      await refreshMovieMetadataResult("metadata-only", {
        metadataMatcher: async () => {
          throw new Error("Metadata-only rows should not be refreshed");
        },
      }).then((result) => result.status),
    ).toBe("missing");
  });

  test("does not take a metadata refresh job held by another runner", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("scan_job")
      .values({
        id: "leased-metadata-job",
        job_kind: "movie_metadata_refresh",
        library_id: null,
        status: "running",
        started_at: now,
        finished_at: null,
        files_seen: 7,
        files_added: 0,
        files_updated: 3,
        files_removed: 0,
        errors_count: 1,
        runner_token: "other-runner",
        runner_heartbeat_at: now,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("scan_job_error")
      .values({
        scan_job_id: "leased-metadata-job",
        path: "existing-error",
        message: "existing error",
        created_at: now,
      })
      .execute();

    await runMovieMetadataRefreshJob("leased-metadata-job", {
      metadataMatcher: async () => {
        throw new Error("leased job should not run");
      },
    });

    const job = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("id", "=", "leased-metadata-job")
      .executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "running",
      files_seen: 7,
      files_updated: 3,
      errors_count: 1,
      runner_token: "other-runner",
    });
    expect(
      await db.selectFrom("scan_job_error").selectAll().where("scan_job_id", "=", "leased-metadata-job").execute(),
    ).toHaveLength(1);
  });

  test("resumes metadata refresh jobs after the last checkpoint", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values({
        id: "movie-2",
        kind: "movie",
        title: "Second Local Title",
        sort_title: "second local title",
        year: 2001,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2001-01-01",
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
        id: "file-2",
        library_id: "library-1",
        media_item_id: "movie-2",
        path: path.join(tempDir, "Second.Movie.2001.mkv"),
        basename: "Second.Movie.2001.mkv",
        extension: ".mkv",
        size_bytes: 10,
        mtime_ms: Date.now(),
        duration_seconds: null,
        video_codec: null,
        audio_codec: null,
        container: "mkv",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("scan_job")
      .values({
        id: "resumable-metadata-job",
        job_kind: "movie_metadata_refresh",
        library_id: null,
        status: "running",
        started_at: now,
        finished_at: null,
        files_seen: 1,
        files_added: 0,
        files_updated: 1,
        files_removed: 0,
        errors_count: 0,
        cancel_requested_at: null,
        rescan_requested_at: null,
        checkpoint_value: "movie-1",
        runner_token: null,
        runner_heartbeat_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const calls: string[] = [];
    await runMovieMetadataRefreshJob("resumable-metadata-job", {
      metadataMatcher: async (title, year) => {
        calls.push(title);
        return {
          provider: "tmdb",
          providerId: "second",
          title: "Second Movie",
          year,
          overview: "Second movie overview",
          runtimeSeconds: 7200,
          posterPath: "/second.jpg",
          backdropPath: "/second-backdrop.jpg",
          releaseDate: "2001-01-01",
          popularity: 10,
          voteAverage: 7.1,
          genres: [],
        };
      },
    });

    expect(calls).toEqual(["Second Movie"]);
    const job = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("id", "=", "resumable-metadata-job")
      .executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "completed",
      files_seen: 2,
      files_updated: 2,
      errors_count: 0,
      checkpoint_value: null,
      runner_token: null,
    });
  });
});
