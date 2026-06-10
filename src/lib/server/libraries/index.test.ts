import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
} from "../db";
import { decryptSecret } from "../secrets";
import {
  createLibrary,
  deleteLibrary,
  listLibraries,
  listLibrariesWithScanStatus,
  updateLibrary,
} from ".";
import { expectRejectsToThrow } from "$lib/test/async-expect";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-libraries-"));

  await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
  await migrateDatabase();
});

afterEach(async () => {
  await closeDatabaseForTests();
  await rm(tempDir, { recursive: true, force: true });
});

describe("createLibrary", () => {
  test("creates a movie library with a normalized path and fallback name", async () => {
    const mediaDir = path.join(tempDir, "movies");
    await mkdir(mediaDir);

    const library = await createLibrary({
      name: "",
      kind: "movie",
      path: mediaDir,
    });
    const rows = await listLibraries();

    expect(library.name).toBe("movies");
    expect(library.path).toBe(await realpath(mediaDir));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: library.id,
      name: "movies",
      kind: "movie",
      path: library.path,
      watch_enabled: 1,
      scan_interval_minutes: null,
    });
  });

  test("stores local library automation settings", async () => {
    const mediaDir = path.join(tempDir, "movies");
    await mkdir(mediaDir);

    const library = await createLibrary({
      name: "Movies",
      kind: "movie",
      path: mediaDir,
      watchEnabled: false,
      scanIntervalMinutes: 60,
    });
    const stored = await getDb()
      .then((db) => db.selectFrom("library").selectAll().where("id", "=", library.id).executeTakeFirstOrThrow());

    expect(stored).toMatchObject({
      watch_enabled: 0,
      scan_interval_minutes: 60,
      last_scheduled_scan_at: null,
    });
  });

  test("creates an SFTP movie library after testing the remote root", async () => {
    const calls: unknown[] = [];
    const library = await createLibrary(
      {
        source: "sftp",
        name: "",
        kind: "movie",
        host: "sftp.example.com",
        port: 22,
        username: "mediauser",
        password: "secret-password",
        root: "/media/movies/",
        walkConcurrency: 6,
        operationTimeoutMs: 45_000,
      },
      {
        testSftpConnection: async (config) => {
          calls.push(config);
        },
      },
    );

    expect(library).toMatchObject({
      name: "movies",
      source: "sftp",
      path: "sftp://mediauser@sftp.example.com:22/media/movies",
      watch_enabled: 0,
      scan_interval_minutes: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      host: "sftp.example.com",
      port: 22,
      username: "mediauser",
      root: "/media/movies",
      walkConcurrency: 6,
      operationTimeoutMs: 45_000,
    });

    const db = await getDb();
    const stored = await db
      .selectFrom("library")
      .selectAll()
      .where("id", "=", library.id)
      .executeTakeFirstOrThrow();
    expect(stored.config_json).not.toContain("secret-password");
    expect(JSON.parse(stored.config_json ?? "{}")).toMatchObject({
      walkConcurrency: 6,
      operationTimeoutMs: 45_000,
    });
  });

  test("rejects unsupported library kinds", async () => {
    await expectRejectsToThrow(
      createLibrary({ name: "Music", kind: "music" as "movie", path: tempDir }),
      "Unsupported library kind.",
    );
  });

  test("creates a TV library", async () => {
    const showsDir = path.join(tempDir, "shows");
    await mkdir(showsDir);

    const library = await createLibrary({
      name: "",
      kind: "tv",
      path: showsDir,
    });

    expect(library).toMatchObject({
      name: "shows",
      kind: "tv",
      path: await realpath(showsDir),
    });
  });

  test("rejects missing paths with a stable validation error", async () => {
    await expectRejectsToThrow(
      createLibrary({
        name: "Missing",
        kind: "movie",
        path: path.join(tempDir, "missing"),
      }),
      "Library path does not exist.",
    );
  });

  test("rejects paths that are not directories", async () => {
    const filePath = path.join(tempDir, "Movie.mp4");
    await writeFile(filePath, "movie");

    await expectRejectsToThrow(
      createLibrary({ name: "File", kind: "movie", path: filePath }),
      "Library path must be a directory.",
    );
  });

  test("rejects duplicate normalized paths", async () => {
    const mediaDir = path.join(tempDir, "movies");
    await mkdir(mediaDir);
    await createLibrary({ name: "Movies", kind: "movie", path: mediaDir });

    await expectRejectsToThrow(
      createLibrary({ name: "Movies Again", kind: "movie", path: mediaDir }),
      "Library path is already configured.",
    );
  });

  test("rejects nested library paths that overlap an existing library", async () => {
    const mediaDir = path.join(tempDir, "movies");
    const childDir = path.join(mediaDir, "Action");
    await mkdir(childDir, { recursive: true });
    await createLibrary({ name: "Movies", kind: "movie", path: mediaDir });

    await expectRejectsToThrow(
      createLibrary({ name: "Action", kind: "movie", path: childDir }),
      "Library path overlaps with an existing library.",
    );
  });

  test("rejects parent library paths that overlap an existing library", async () => {
    const mediaDir = path.join(tempDir, "movies");
    const childDir = path.join(mediaDir, "Action");
    await mkdir(childDir, { recursive: true });
    await createLibrary({ name: "Action", kind: "movie", path: childDir });

    await expectRejectsToThrow(
      createLibrary({ name: "Movies", kind: "movie", path: mediaDir }),
      "Library path overlaps with an existing library.",
    );
  });

  test("lists the latest scan status for each library", async () => {
    const mediaDir = path.join(tempDir, "movies");
    await mkdir(mediaDir);
    const library = await createLibrary({
      name: "Movies",
      kind: "movie",
      path: mediaDir,
    });

    const db = await getDb();
    const now = new Date().toISOString();
    await db
      .insertInto("scan_job")
      .values([
        {
          id: "older-job",
          library_id: library.id,
          status: "completed",
          started_at: now,
          finished_at: now,
          files_seen: 1,
          files_added: 1,
          files_updated: 0,
          errors_count: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "active-job",
          library_id: library.id,
          status: "running",
          started_at: now,
          finished_at: null,
          files_seen: 4,
          files_added: 2,
          files_updated: 1,
          errors_count: 1,
          created_at: "2026-01-02T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
      ])
      .execute();

    const rows = await listLibrariesWithScanStatus();
    expect(rows).toHaveLength(1);
    expect(rows[0].scanActive).toBe(true);
    expect(rows[0].latestScanJob).toMatchObject({
      id: "active-job",
      status: "running",
      files_seen: 4,
      files_added: 2,
      files_updated: 1,
      errors_count: 1,
    });
  });

  test("updates a local library name and path", async () => {
    const mediaDir = path.join(tempDir, "movies");
    const updatedDir = path.join(tempDir, "updated-movies");
    await mkdir(mediaDir);
    await mkdir(updatedDir);
    const library = await createLibrary({
      name: "Movies",
      kind: "movie",
      path: mediaDir,
    });

    await updateLibrary(library.id, {
      source: "local",
      name: "",
      path: updatedDir,
      watchEnabled: false,
      scanIntervalMinutes: 360,
    });

    const rows = await listLibraries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: library.id,
      name: "updated-movies",
      source: "local",
      path: await realpath(updatedDir),
      config_json: null,
      watch_enabled: 0,
      scan_interval_minutes: 360,
      last_scheduled_scan_at: null,
    });
  });

  test("updates an SFTP library and keeps the existing password when blank", async () => {
    const library = await createLibrary(
      {
        source: "sftp",
        name: "Remote",
        kind: "movie",
        host: "sftp.example.com",
        port: 22,
        username: "mediauser",
        password: "original-password",
        root: "movies",
        walkConcurrency: 5,
        operationTimeoutMs: 60_000,
      },
      { testSftpConnection: async () => undefined },
    );
    const calls: unknown[] = [];

    await updateLibrary(
      library.id,
      {
        source: "sftp",
        name: "",
        host: "sftp.example.com",
        port: 23,
        username: "mediauser",
        password: "",
        root: "radarr/movies",
        walkConcurrency: 7,
        operationTimeoutMs: 75_000,
        scanIntervalMinutes: 720,
      },
      {
        testSftpConnection: async (config) => {
          calls.push(config);
        },
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      host: "sftp.example.com",
      port: 23,
      username: "mediauser",
      root: "radarr/movies",
      walkConcurrency: 7,
      operationTimeoutMs: 75_000,
    });
    const db = await getDb();
    const updated = await db
      .selectFrom("library")
      .selectAll()
      .where("id", "=", library.id)
      .executeTakeFirstOrThrow();
    expect(updated).toMatchObject({
      name: "movies",
      source: "sftp",
      path: "sftp://mediauser@sftp.example.com:23/radarr/movies",
      watch_enabled: 0,
      scan_interval_minutes: 720,
    });
    const config = JSON.parse(updated.config_json ?? "{}");
    expect(decryptSecret(config.passwordEncrypted)).toBe("original-password");
    expect(config.walkConcurrency).toBe(7);
    expect(config.operationTimeoutMs).toBe(75_000);
  });

  test("rejects editing a library while it has an active scan", async () => {
    const mediaDir = path.join(tempDir, "movies");
    const updatedDir = path.join(tempDir, "updated-movies");
    await mkdir(mediaDir);
    await mkdir(updatedDir);
    const library = await createLibrary({
      name: "Movies",
      kind: "movie",
      path: mediaDir,
    });
    const db = await getDb();
    const now = new Date().toISOString();
    await db
      .insertInto("scan_job")
      .values({
        id: "active-edit-job",
        library_id: library.id,
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
      .execute();

    await expectRejectsToThrow(
      updateLibrary(library.id, {
        source: "local",
        name: "Updated",
        path: updatedDir,
      }),
      "Library has an active scan.",
    );
    const unchanged = await db
      .selectFrom("library")
      .selectAll()
      .where("id", "=", library.id)
      .executeTakeFirstOrThrow();
    expect(unchanged.name).toBe("Movies");
  });

  test("removes a library and only deletes media items orphaned by that library", async () => {
    const mediaDir = path.join(tempDir, "movies");
    const secondDir = path.join(tempDir, "more-movies");
    await mkdir(mediaDir);
    await mkdir(secondDir);
    const library = await createLibrary({
      name: "Movies",
      kind: "movie",
      path: mediaDir,
    });
    const secondLibrary = await createLibrary({
      name: "More Movies",
      kind: "movie",
      path: secondDir,
    });

    const db = await getDb();
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
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
      .insertInto("media_item")
      .values([
        {
          id: "library-only-movie",
          kind: "movie",
          title: "Library Only",
          sort_title: "library only",
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
        },
        {
          id: "shared-movie",
          kind: "movie",
          title: "Shared",
          sort_title: "shared",
          year: 2025,
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
        },
        {
          id: "metadata-only",
          kind: "movie",
          title: "Metadata Only",
          sort_title: "metadata only",
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
        },
      ])
      .execute();
    await db
      .insertInto("media_file")
      .values([
        {
          id: "library-only-file",
          library_id: library.id,
          media_item_id: "library-only-movie",
          path: path.join(mediaDir, "Library.Only.2024.mp4"),
          basename: "Library.Only.2024.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
        {
          id: "shared-file-a",
          library_id: library.id,
          media_item_id: "shared-movie",
          path: path.join(mediaDir, "Shared.2025.mp4"),
          basename: "Shared.2025.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
        {
          id: "shared-file-b",
          library_id: secondLibrary.id,
          media_item_id: "shared-movie",
          path: path.join(secondDir, "Shared.2025.mp4"),
          basename: "Shared.2025.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "library-only-movie",
        media_file_id: "library-only-file",
        position_seconds: 12,
        duration_seconds: 120,
        completed: 0,
        updated_at: now,
      })
      .execute();

    await deleteLibrary(library.id);

    expect((await listLibraries()).map((item) => item.id)).toEqual([
      secondLibrary.id,
    ]);
    expect(
      await db
        .selectFrom("media_file")
        .select("id")
        .where("library_id", "=", library.id)
        .execute(),
    ).toHaveLength(0);
    expect(
      await db.selectFrom("watch_progress").selectAll().execute(),
    ).toHaveLength(0);

    const movies = await db
      .selectFrom("media_item")
      .select(["id"])
      .orderBy("id", "asc")
      .execute();
    expect(movies.map((movie) => movie.id)).toEqual([
      "metadata-only",
      "shared-movie",
    ]);
  });

  test("rejects deleting a library while it has an active scan", async () => {
    const mediaDir = path.join(tempDir, "movies");
    await mkdir(mediaDir);
    const library = await createLibrary({
      name: "Movies",
      kind: "movie",
      path: mediaDir,
    });

    const db = await getDb();
    const now = new Date().toISOString();
    await db
      .insertInto("scan_job")
      .values({
        id: "active-job",
        library_id: library.id,
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
      deleteLibrary(library.id),
      "Library has an active scan.",
    );
    expect((await listLibraries()).map((item) => item.id)).toEqual([
      library.id,
    ]);
  });
});
