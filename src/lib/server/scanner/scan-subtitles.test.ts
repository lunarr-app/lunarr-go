import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { createLocalStorage, type LibraryStorage } from "../storage";
import type { ScanContext } from "./scan-types";
import { syncSidecarSubtitleTracks } from "./scan-subtitles";

describe("syncSidecarSubtitleTracks", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  let currentStorage: LibraryStorage | null = null;
  const now = new Date().toISOString();

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-scan-subtitles-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

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
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "movie-file",
        library_id: "library-1",
        media_item_id: "movie-1",
        path: path.join(tempDir, "Movie.mp4"),
        basename: "Movie.mp4",
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
  });

  afterEach(async () => {
    await currentStorage?.close().catch(() => undefined);
    currentStorage = null;
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  function scanContext(directoryPaths: string[]): ScanContext {
    const storage = createLocalStorage();
    currentStorage = storage;
    return {
      directoryEntryCache: new Map(),
      directoryVideoCounts: new Map(),
      directoryFileReader: async () => ({ ok: true, paths: directoryPaths }),
      existingFilesByPath: new Map(),
      tvSeasonMetadataCache: new Map(),
      tvSeasonEpisodeSyncCache: new Map(),
      probeBackend: null,
      storage,
    };
  }

  test("stores the correct mime type for vtt and srt sidecars", async () => {
    await writeFile(path.join(tempDir, "Movie.en.vtt"), "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n");
    await writeFile(path.join(tempDir, "Movie.fr.srt"), "1\n00:00:00,000 --> 00:00:01,000\nBonjour\n");

    await syncSidecarSubtitleTracks(
      "movie-1",
      "movie-file",
      path.join(tempDir, "Movie.mp4"),
      now,
      scanContext([
        path.join(tempDir, "Movie.mp4"),
        path.join(tempDir, "Movie.en.vtt"),
        path.join(tempDir, "Movie.fr.srt"),
      ]),
    );

    const tracks = await db.selectFrom("subtitle_track").selectAll().orderBy("language").execute();
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({ language: "en", mime_type: "text/vtt" });
    expect(tracks[1]).toMatchObject({ language: "fr", mime_type: "application/x-subrip" });
  });

  test("prefers vtt over srt for the same language", async () => {
    await writeFile(path.join(tempDir, "Movie.en.vtt"), "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n");
    await writeFile(path.join(tempDir, "Movie.en.srt"), "1\n00:00:00,000 --> 00:00:01,000\nHello\n");

    await syncSidecarSubtitleTracks(
      "movie-1",
      "movie-file",
      path.join(tempDir, "Movie.mp4"),
      now,
      scanContext([
        path.join(tempDir, "Movie.mp4"),
        path.join(tempDir, "Movie.en.vtt"),
        path.join(tempDir, "Movie.en.srt"),
      ]),
    );

    const tracks = await db.selectFrom("subtitle_track").selectAll().execute();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ language: "en", mime_type: "text/vtt" });
    expect(tracks[0].path).toEndWith("Movie.en.vtt");
  });
});
