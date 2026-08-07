import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { createLibrary } from "../libraries";
import { getShowDetail } from "../media/shows/detail";
import { getPlaybackDecision, saveProgress } from "../playback";
import type { LibraryStorage } from "../storage";
import { createScanJob, runScanJob } from "./scan-jobs";

let tempDir: string;
let db: Kysely<Database>;

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-scanner-tv-"));
  await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
  await migrateDatabase();
  db = await getDb();
});

afterAll(async () => {
  await closeDatabaseForTests();
  await rm(tempDir, { recursive: true, force: true });
});

describe("runScanJob", () => {
  test("scans TV episodes into show, season, and episode rows", async () => {
    const showsDir = path.join(tempDir, "shows");
    const seasonDir = path.join(showsDir, "The Expanse", "Season 01");
    await mkdir(seasonDir, { recursive: true });
    await writeFile(path.join(seasonDir, "The Expanse - S01E02 - The Big Empty.mkv"), "episode");
    await writeFile(path.join(seasonDir, "The Expanse - S01E02 - The Big Empty.en.vtt"), "WEBVTT\n");
    const tvLibrary = await createLibrary({
      name: "Shows",
      kind: "tv",
      path: showsDir,
    });

    const jobId = await createScanJob(tvLibrary.id);
    await runScanJob(jobId, { tvSeasonMetadataMatcher: async () => null });

    const job = await db.selectFrom("scan_job").selectAll().where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_added: 1,
      files_updated: 0,
      errors_count: 0,
    });

    const show = await db
      .selectFrom("media_item")
      .selectAll()
      .where("kind", "=", "show")
      .where("title", "=", "The Expanse")
      .executeTakeFirstOrThrow();
    const season = await db
      .selectFrom("media_item")
      .selectAll()
      .where("kind", "=", "season")
      .where("parent_id", "=", show.id)
      .executeTakeFirstOrThrow();
    const episode = await db
      .selectFrom("media_item")
      .selectAll()
      .where("kind", "=", "episode")
      .where("parent_id", "=", season.id)
      .executeTakeFirstOrThrow();
    expect(season).toMatchObject({
      title: "Season 1",
      season_number: 1,
      episode_number: null,
    });
    expect(episode).toMatchObject({
      title: "The Big Empty",
      season_number: 1,
      episode_number: 2,
    });

    const file = await db
      .selectFrom("media_file")
      .selectAll()
      .where("media_item_id", "=", episode.id)
      .executeTakeFirstOrThrow();
    const decision = await getPlaybackDecision(episode.id);
    expect(decision?.file.id).toBe(file.id);

    await db
      .insertInto("user")
      .values({
        id: "tv-user",
        name: "TV User",
        email: "tv-user@example.test",
        email_verified: 0,
        image: null,
        role: "user",
        created_at: Date.now(),
        updated_at: Date.now(),
      })
      .execute();
    await saveProgress({
      userId: "tv-user",
      mediaItemId: episode.id,
      mediaFileId: file.id,
      positionSeconds: 120,
      durationSeconds: 1200,
      completed: false,
    });

    const progress = await db
      .selectFrom("watch_progress")
      .select(["media_item_id", "media_file_id", "position_seconds", "completed"])
      .where("media_item_id", "=", episode.id)
      .executeTakeFirstOrThrow();
    expect(progress).toMatchObject({
      media_item_id: episode.id,
      media_file_id: file.id,
      position_seconds: 120,
      completed: 0,
    });
  });

  test("scans TV episodes from remote-like SFTP paths", async () => {
    const now = new Date().toISOString();
    const remoteRoot = "/media/shows";
    const remoteDir = "/media/shows/The Expanse/Season 01";
    const remoteFile = `${remoteDir}/The Expanse - S01E02 - The Big Empty.mkv`;
    await db
      .insertInto("library")
      .values({
        id: "sftp-tv-library",
        name: "SFTP Shows",
        kind: "tv",
        source: "sftp",
        path: "sftp://mediauser@sftp.example.test:22/media/shows",
        config_json: "{}",
        created_at: now,
        updated_at: now,
      })
      .execute();

    const storage: LibraryStorage = {
      source: "sftp",
      root: remoteRoot,
      async statFile(filePath) {
        if (filePath !== remoteFile) return null;
        return {
          path: filePath,
          basename: path.posix.basename(filePath),
          extension: ".mkv",
          size: 1234,
          mtimeMs: 1_800_000_000_000,
        };
      },
      async listFiles() {
        return [];
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
              extension: ".mkv",
              size: 1234,
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
            extension: ".mkv",
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

    const jobId = await createScanJob("sftp-tv-library");
    await runScanJob(jobId, {
      storage,
      tvSeasonMetadataMatcher: async () => null,
      probeBackend: null,
    });

    const file = await db
      .selectFrom("media_file")
      .select(["path", "media_item_id"])
      .where("library_id", "=", "sftp-tv-library")
      .executeTakeFirstOrThrow();
    const episode = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", file.media_item_id)
      .executeTakeFirstOrThrow();
    expect(episode).toMatchObject({
      title: "The Big Empty",
      season_number: 1,
      episode_number: 2,
    });
    expect(file.path).toBe(remoteFile);
  });

  test("scans TV episodes from remote-like WebDAV paths", async () => {
    const now = new Date().toISOString();
    const remoteRoot = "/dav/shows";
    const remoteDir = "/dav/shows/Stargate SG-1/Season 01";
    const remoteFile = `${remoteDir}/Stargate SG-1 - S01E02 - Children of the Gods.mkv`;
    await db
      .insertInto("library")
      .values({
        id: "webdav-tv-library",
        name: "WebDAV Shows",
        kind: "tv",
        source: "webdav",
        path: "webdavs://mediauser@nas.example.test/media/shows",
        config_json: "{}",
        created_at: now,
        updated_at: now,
      })
      .execute();

    const storage: LibraryStorage = {
      source: "webdav",
      root: remoteRoot,
      async statFile(filePath) {
        if (filePath !== remoteFile) return null;
        return {
          path: filePath,
          basename: path.posix.basename(filePath),
          extension: ".mkv",
          size: 1234,
          mtimeMs: 1_800_000_000_000,
        };
      },
      async listFiles() {
        return [];
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
              extension: ".mkv",
              size: 1234,
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
            extension: ".mkv",
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

    const jobId = await createScanJob("webdav-tv-library");
    await runScanJob(jobId, {
      storage,
      tvSeasonMetadataMatcher: async () => null,
      probeBackend: null,
    });

    const file = await db
      .selectFrom("media_file")
      .select(["path", "media_item_id"])
      .where("library_id", "=", "webdav-tv-library")
      .executeTakeFirstOrThrow();
    const episode = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", file.media_item_id)
      .executeTakeFirstOrThrow();
    expect(episode).toMatchObject({
      title: "Children of the Gods",
      season_number: 1,
      episode_number: 2,
    });
    expect(file.path).toBe(remoteFile);

    await db.deleteFrom("library").where("id", "=", "webdav-tv-library").execute();
  });

  test("prunes stale TV episode files and orphaned season/show rows", async () => {
    const showsDir = path.join(tempDir, "pruned-shows");
    const seasonDir = path.join(showsDir, "Prune Show", "Season 01");
    const episodePath = path.join(seasonDir, "Prune Show - S01E02 - Gone Away.mkv");
    await mkdir(seasonDir, { recursive: true });
    await writeFile(episodePath, "episode");
    const tvLibrary = await createLibrary({
      name: "Pruned Shows",
      kind: "tv",
      path: showsDir,
    });

    const firstJobId = await createScanJob(tvLibrary.id);
    await runScanJob(firstJobId, { tvSeasonMetadataMatcher: async () => null });
    const file = await db
      .selectFrom("media_file")
      .select("media_item_id")
      .where("library_id", "=", tvLibrary.id)
      .executeTakeFirstOrThrow();
    const episode = await db
      .selectFrom("media_item")
      .select(["id", "parent_id"])
      .where("id", "=", file.media_item_id)
      .executeTakeFirstOrThrow();
    const season = await db
      .selectFrom("media_item")
      .select(["id", "parent_id"])
      .where("id", "=", episode.parent_id)
      .executeTakeFirstOrThrow();
    const itemIds = [episode.id, season.id, season.parent_id ?? ""].filter(Boolean);
    await unlink(episodePath);

    const secondJobId = await createScanJob(tvLibrary.id);
    await runScanJob(secondJobId, {
      tvSeasonMetadataMatcher: async () => null,
    });

    const secondJob = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("id", "=", secondJobId)
      .executeTakeFirstOrThrow();
    expect(secondJob).toMatchObject({
      status: "completed",
      files_seen: 0,
      files_removed: 1,
      errors_count: 0,
    });
    expect(await db.selectFrom("media_file").select("id").where("library_id", "=", tvLibrary.id).execute()).toEqual([]);
    expect(await db.selectFrom("media_item").select("id").where("id", "in", itemIds).execute()).toEqual([]);
  });

  test("enriches TV show, season, and episode rows with matched TMDb metadata", async () => {
    const showsDir = path.join(tempDir, "matched-shows");
    const seasonDir = path.join(showsDir, "Battlestar Galactica", "Season 01");
    await mkdir(seasonDir, { recursive: true });
    await writeFile(path.join(seasonDir, "Battlestar Galactica - S01E01 - 33.mkv"), "episode");
    const tvLibrary = await createLibrary({
      name: "Matched Shows",
      kind: "tv",
      path: showsDir,
    });

    const jobId = await createScanJob(tvLibrary.id);
    await runScanJob(jobId, {
      tvSeasonMetadataMatcher: async (title, year, seasonNumber) => {
        expect({ title, year, seasonNumber }).toEqual({
          title: "Battlestar Galactica",
          year: null,
          seasonNumber: 1,
        });
        return {
          show: {
            provider: "tmdb",
            providerId: "1972",
            title: "Battlestar Galactica",
            year: 2004,
            originalTitle: "Battlestar Galactica",
            overview: "Humanity searches for a new home.",
            tagline: null,
            posterPath: "/bsg-poster.jpg",
            backdropPath: "/bsg-backdrop.jpg",
            firstAirDate: "2004-10-18",
            status: "Ended",
            homepage: "https://example.test/bsg",
            originalLanguage: "en",
            imdbId: "tt0407362",
            popularity: 80,
            voteAverage: 8.2,
            voteCount: 1200,
            certification: "TV-14",
            trailer: null,
            genres: [{ providerId: "10765", name: "Sci-Fi & Fantasy" }],
            cast: [
              {
                providerId: "1",
                creditId: "cast-1",
                name: "Edward James Olmos",
                originalName: null,
                character: "Adama",
                order: 0,
                profilePath: "/ej.jpg",
              },
            ],
            crew: [],
            videos: [],
            keywords: [],
            productionCompanies: [],
            productionCountries: [],
            spokenLanguages: [],
          },
          season: {
            provider: "tmdb",
            providerId: "season-10",
            title: "Season 1",
            seasonNumber: 1,
            overview: "The first season.",
            posterPath: "/season.jpg",
            airDate: "2004-10-18",
            voteAverage: 8.1,
          },
          episodes: [
            {
              provider: "tmdb",
              providerId: "episode-100",
              title: "33",
              seasonNumber: 1,
              episodeNumber: 1,
              overview: "The fleet jumps every 33 minutes.",
              stillPath: "/33.jpg",
              airDate: "2004-10-18",
              runtimeSeconds: 2640,
              voteAverage: 8.7,
              voteCount: 20,
            },
            {
              provider: "tmdb",
              providerId: "episode-101",
              title: "Water",
              seasonNumber: 1,
              episodeNumber: 2,
              overview: "The fleet searches for water.",
              stillPath: "/water.jpg",
              airDate: "2004-10-25",
              runtimeSeconds: 2640,
              voteAverage: 8.1,
              voteCount: 18,
            },
          ],
        };
      },
    });

    const show = await db
      .selectFrom("media_item")
      .selectAll()
      .where("kind", "=", "show")
      .where("provider_id", "=", "1972")
      .executeTakeFirstOrThrow();
    const season = await db
      .selectFrom("media_item")
      .selectAll()
      .where("kind", "=", "season")
      .where("provider_id", "=", "season-10")
      .executeTakeFirstOrThrow();
    const episodes = await db
      .selectFrom("media_item")
      .selectAll()
      .where("kind", "=", "episode")
      .where("parent_id", "=", season.id)
      .orderBy("episode_number", "asc")
      .execute();
    const episode = episodes[0];
    const missingEpisode = episodes[1];
    expect(show).toMatchObject({
      title: "Battlestar Galactica",
      year: 2004,
      poster_path: "/bsg-poster.jpg",
      backdrop_path: "/bsg-backdrop.jpg",
      certification: "TV-14",
    });
    expect(season).toMatchObject({
      parent_id: show.id,
      season_number: 1,
      poster_path: "/season.jpg",
      release_date: "2004-10-18",
    });
    expect(episode).toMatchObject({
      parent_id: season.id,
      title: "33",
      season_number: 1,
      episode_number: 1,
      runtime_seconds: 2640,
      poster_path: "/33.jpg",
      release_date: "2004-10-18",
    });
    expect(missingEpisode).toMatchObject({
      parent_id: season.id,
      title: "Water",
      season_number: 1,
      episode_number: 2,
      poster_path: "/water.jpg",
      release_date: "2004-10-25",
    });
    expect(
      await db.selectFrom("media_file").select("id").where("media_item_id", "=", missingEpisode.id).execute(),
    ).toEqual([]);
    expect(await getShowDetail(show.id, "user-1")).toMatchObject({
      seasons: [
        {
          episodes: [
            { title: "33", fileCount: 1 },
            { title: "Water", fileCount: 0, fileId: null },
          ],
        },
      ],
    });
    expect(
      await db.selectFrom("media_item_genre").select(["name"]).where("media_item_id", "=", show.id).execute(),
    ).toEqual([{ name: "Sci-Fi & Fantasy" }]);
    expect(
      await db
        .selectFrom("media_item_credit")
        .select(["name", "character_name"])
        .where("media_item_id", "=", show.id)
        .execute(),
    ).toEqual([{ name: "Edward James Olmos", character_name: "Adama" }]);

    let repeatLookups = 0;
    const secondJobId = await createScanJob(tvLibrary.id);
    await runScanJob(secondJobId, {
      tvSeasonMetadataMatcher: async () => {
        repeatLookups += 1;
        return null;
      },
    });
    const secondJob = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("id", "=", secondJobId)
      .executeTakeFirstOrThrow();
    expect(secondJob).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_added: 0,
      files_updated: 0,
      errors_count: 0,
    });
    expect(repeatLookups).toBe(1);
  });
});
