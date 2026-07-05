import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { SHOW_PAGE_SIZE } from "./catalog";
import { setContinueMaxAgeDaysForTests } from "./continue-max-age";
import { showRows } from "./shows/browse";
import {
  getShowCredits,
  getShowDetail,
  getShowOverview,
  getShowResumeEpisode,
  getShowSeasonDetail,
} from "./shows/detail";
import { tvRows } from "./shows/episodes";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";

describe("showRows", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-shows-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Show User",
        email: "shows@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: nowMs,
        updated_at: nowMs,
      })
      .execute();
    await db
      .insertInto("library")
      .values({
        id: "library-1",
        name: "Shows",
        kind: "tv",
        path: tempDir,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "show-1",
          kind: "show",
          title: "The Expanse",
          sort_title: "expanse",
          year: 2015,
          overview: "A missing person case becomes a system-wide mystery.",
          poster_path: "/show.jpg",
          backdrop_path: "/backdrop.jpg",
          release_date: "2015-12-14",
          status: "Ended",
          provider: "tmdb",
          provider_id: "63639",
          parent_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "season-1",
          kind: "season",
          title: "Season 1",
          sort_title: "0001",
          season_number: 1,
          provider: "tmdb",
          provider_id: "season-1",
          parent_id: "show-1",
          created_at: now,
          updated_at: now,
        },
        {
          id: "episode-1",
          kind: "episode",
          title: "Dulcinea",
          sort_title: "s001e0001",
          season_number: 1,
          episode_number: 1,
          overview: "The opener.",
          runtime_seconds: 2700,
          poster_path: "/still.jpg",
          release_date: "2015-12-14",
          provider: "tmdb",
          provider_id: "episode-1",
          parent_id: "season-1",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "file-1",
        library_id: "library-1",
        media_item_id: "episode-1",
        path: path.join(tempDir, "The Expanse/Season 01/The Expanse - S01E01.mkv"),
        basename: "The Expanse - S01E01.mkv",
        extension: ".mkv",
        size_bytes: 10,
        mtime_ms: nowMs,
        duration_seconds: null,
        video_codec: null,
        audio_codec: null,
        container: "mkv",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_item_genre")
      .values({
        media_item_id: "show-1",
        provider: "tmdb",
        provider_id: "10765",
        name: "Sci-Fi & Fantasy",
        position: 0,
      })
      .execute();
    await db
      .insertInto("media_item_credit")
      .values({
        media_item_id: "show-1",
        credit_type: "cast",
        provider: "tmdb",
        provider_id: "person-1",
        credit_id: "credit-1",
        name: "Shohreh Aghdashloo",
        original_name: "Shohreh Aghdashloo",
        profile_path: "/shohreh.jpg",
        credit_order: 0,
        department: null,
        job: null,
        character_name: "Chrisjen Avasarala",
      })
      .execute();
  });

  afterEach(async () => {
    setContinueMaxAgeDaysForTests(undefined);
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("lists playable shows with season and episode counts", async () => {
    expect(await showRows("user-1", "exp", "title")).toMatchObject([
      {
        id: "show-1",
        title: "The Expanse",
        year: 2015,
        episodeCount: 1,
        seasonCount: 1,
        posterUrl: "https://image.tmdb.org/t/p/w342/show.jpg",
      },
    ]);
    expect(await showRows("user-1", "missing", "title")).toEqual([]);
  });

  test("matches shows by original title, episode title, keywords, genres, and basename", async () => {
    await db.updateTable("media_item").set({ original_title: "Leviathan Wakes" }).where("id", "=", "show-1").execute();
    await db
      .insertInto("media_item_keyword")
      .values({
        media_item_id: "show-1",
        provider: "tmdb",
        provider_id: "keyword-1",
        name: "space opera",
      })
      .execute();

    expect((await showRows("user-1", "leviathan", "title")).map((show) => show.title)).toEqual(["The Expanse"]);
    expect((await showRows("user-1", "dulcinea", "title")).map((show) => show.title)).toEqual(["The Expanse"]);
    expect((await showRows("user-1", "sci-fi", "title")).map((show) => show.title)).toEqual(["The Expanse"]);
    expect((await showRows("user-1", "space opera", "title")).map((show) => show.title)).toEqual(["The Expanse"]);
    expect((await showRows("user-1", "s01e01", "title")).map((show) => show.title)).toEqual(["The Expanse"]);
  });

  test("treats show search wildcards as literal text", async () => {
    await db
      .updateTable("media_item")
      .set({ title: "100% Real", sort_title: "100% real" })
      .where("id", "=", "show-1")
      .execute();

    expect((await showRows("user-1", "%", "title")).map((show) => show.title)).toEqual(["100% Real"]);
    expect((await showRows("user-1", "_", "title")).map((show) => show.title)).toEqual([]);
  });

  test("loads show detail with seasons, episodes, playback file, and progress", async () => {
    await db
      .insertInto("media_item")
      .values({
        id: "episode-missing",
        kind: "episode",
        title: "The Big Empty",
        sort_title: "s001e0002",
        season_number: 1,
        episode_number: 2,
        overview: "The missing second episode.",
        runtime_seconds: 2700,
        poster_path: "/still-2.jpg",
        release_date: "2015-12-15",
        provider: "tmdb",
        provider_id: "episode-missing",
        parent_id: "season-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "episode-1",
        media_file_id: "file-1",
        position_seconds: 120,
        duration_seconds: 2700,
        completed: 0,
        updated_at: new Date(Date.now() + 1000).toISOString(),
      })
      .execute();

    expect(await getShowDetail("show-1", "user-1")).toMatchObject({
      show: {
        id: "show-1",
        title: "The Expanse",
        posterUrl: "https://image.tmdb.org/t/p/w342/show.jpg",
        genres: ["Sci-Fi & Fantasy"],
      },
      cast: [
        {
          provider: "tmdb",
          providerId: "person-1",
          name: "Shohreh Aghdashloo",
          character: "Chrisjen Avasarala",
          profilePath: "/shohreh.jpg",
        },
      ],
      seasons: [
        {
          id: "season-1",
          title: "Season 1",
          seasonNumber: 1,
          episodes: [
            {
              id: "episode-1",
              title: "Dulcinea",
              episodeNumber: 1,
              fileId: "file-1",
              progressSeconds: 120,
              durationSeconds: 2700,
              completed: false,
            },
            {
              id: "episode-missing",
              title: "The Big Empty",
              episodeNumber: 2,
              fileCount: 0,
              fileId: null,
              progressSeconds: 0,
              durationSeconds: null,
              completed: false,
            },
          ],
        },
      ],
    });
    expect(await getShowDetail("episode-1", "user-1")).toBeNull();
  });

  test("loads show overview with season stubs and no episode arrays", async () => {
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "episode-1",
        media_file_id: "file-1",
        position_seconds: 2700,
        duration_seconds: 2700,
        completed: 1,
        updated_at: new Date().toISOString(),
      })
      .execute();

    const overview = await getShowOverview("show-1", "user-1");
    expect(overview).toMatchObject({
      show: {
        id: "show-1",
        title: "The Expanse",
        genres: ["Sci-Fi & Fantasy"],
      },
      seasons: [
        {
          id: "season-1",
          title: "Season 1",
          seasonNumber: 1,
          episodeCount: 1,
          playableCount: 1,
          watchedCount: 1,
        },
      ],
    });
    expect(overview?.seasons[0]).not.toHaveProperty("episodes");
    expect(overview).not.toHaveProperty("cast");
  });

  test("picks the resume episode without loading the full show tree", async () => {
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "episode-1",
        media_file_id: "file-1",
        position_seconds: 120,
        duration_seconds: 2700,
        completed: 0,
        updated_at: new Date().toISOString(),
      })
      .execute();

    expect(await getShowResumeEpisode("show-1", "user-1")).toMatchObject({
      id: "episode-1",
      fileId: "file-1",
      progressSeconds: 120,
      seasonNumber: 1,
      episodeNumber: 1,
    });
  });

  test("loads show credits with cast and creators", async () => {
    const credits = await getShowCredits("show-1", "user-1");
    expect(credits).toMatchObject({
      show: { id: "show-1", title: "The Expanse" },
      cast: [
        {
          provider: "tmdb",
          providerId: "person-1",
          name: "Shohreh Aghdashloo",
          character: "Chrisjen Avasarala",
        },
      ],
      creators: [],
    });
  });

  test("loads one season by id or season number", async () => {
    const byId = await getShowSeasonDetail("show-1", "season-1", "user-1");
    expect(byId).toMatchObject({
      show: { id: "show-1", title: "The Expanse" },
      season: {
        id: "season-1",
        seasonNumber: 1,
        episodes: [{ id: "episode-1", title: "Dulcinea", fileId: "file-1" }],
      },
      seasons: [{ id: "season-1", title: "Season 1", seasonNumber: 1 }],
    });

    const byNumber = await getShowSeasonDetail("show-1", "1", "user-1");
    expect(byNumber?.season.id).toBe("season-1");
    expect(await getShowSeasonDetail("show-1", "missing", "user-1")).toBeNull();
  });

  test("loads TV rails for continue, next up, recently aired shows, and popular", async () => {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "episode-2",
          kind: "episode",
          title: "The Big Empty",
          sort_title: "s001e0002",
          season_number: 1,
          episode_number: 2,
          overview: "The crew keeps moving.",
          runtime_seconds: 2700,
          poster_path: "/still-2.jpg",
          release_date: "2015-12-15",
          provider: "tmdb",
          provider_id: "episode-2",
          parent_id: "season-1",
          created_at: now,
          updated_at: now,
        },
        {
          id: "episode-3",
          kind: "episode",
          title: "Remember the Cant",
          sort_title: "s001e0003",
          season_number: 1,
          episode_number: 3,
          overview: "The next unwatched episode.",
          runtime_seconds: 2700,
          poster_path: "/still-3.jpg",
          release_date: "2015-12-16",
          provider: "tmdb",
          provider_id: "episode-3",
          parent_id: "season-1",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("media_file")
      .values([
        {
          id: "file-2",
          library_id: "library-1",
          media_item_id: "episode-2",
          path: path.join(tempDir, "The Expanse/Season 01/The Expanse - S01E02.mkv"),
          basename: "The Expanse - S01E02.mkv",
          extension: ".mkv",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mkv",
          created_at: new Date(nowMs + 1000).toISOString(),
          updated_at: now,
        },
        {
          id: "file-3",
          library_id: "library-1",
          media_item_id: "episode-3",
          path: path.join(tempDir, "The Expanse/Season 01/The Expanse - S01E03.mkv"),
          basename: "The Expanse - S01E03.mkv",
          extension: ".mkv",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mkv",
          created_at: new Date(nowMs + 2000).toISOString(),
          updated_at: now,
        },
      ])
      .execute();
    await db.updateTable("media_item").set({ popularity: 42, vote_average: 8.5 }).where("id", "=", "show-1").execute();
    await db
      .insertInto("watch_progress")
      .values([
        {
          user_id: "user-1",
          media_item_id: "episode-1",
          media_file_id: "file-1",
          position_seconds: 2700,
          duration_seconds: 2700,
          completed: 1,
          updated_at: new Date(nowMs + 3000).toISOString(),
        },
        {
          user_id: "user-1",
          media_item_id: "episode-2",
          media_file_id: "file-2",
          position_seconds: 120,
          duration_seconds: 2700,
          completed: 0,
          updated_at: new Date(nowMs + 4000).toISOString(),
        },
      ])
      .execute();

    const rows = await tvRows("user-1");

    expect(rows.continueWatching.map((episode) => episode.id)).toEqual(["episode-2"]);
    expect(rows.continueWatching[0]).toMatchObject({
      showTitle: "The Expanse",
      fileId: "file-2",
      progressSeconds: 120,
    });
    expect(rows.nextUp.map((episode) => episode.id)).toEqual(["episode-3"]);
    expect(rows.latest[0]).toMatchObject({
      id: "show-1",
      latestEpisodeReleaseDate: "2015-12-16",
    });
    expect(rows.popular[0]).toMatchObject({
      id: "show-1",
      popularity: 42,
    });
    expect(rows.all[0]).toMatchObject({ id: "show-1", episodeCount: 3 });

    const nextUpOnly = await tvRows("user-1", "", "title", 1, SHOW_PAGE_SIZE, ["nextUp"]);
    expect(nextUpOnly.nextUp?.map((episode) => episode.id)).toEqual(["episode-3"]);
    expect(nextUpOnly).not.toHaveProperty("all");
    expect(nextUpOnly).not.toHaveProperty("continueWatching");
  });

  test("hides accidental continue starts without removing browse progress", async () => {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    await db
      .insertInto("media_item")
      .values({
        id: "episode-2",
        kind: "episode",
        title: "The Big Empty",
        sort_title: "s001e0002",
        season_number: 1,
        episode_number: 2,
        overview: "The crew keeps moving.",
        runtime_seconds: 2700,
        poster_path: "/still-2.jpg",
        release_date: "2015-12-15",
        provider: "tmdb",
        provider_id: "episode-2",
        parent_id: "season-1",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_file")
      .values({
        id: "file-2",
        library_id: "library-1",
        media_item_id: "episode-2",
        path: path.join(tempDir, "The Expanse/Season 01/The Expanse - S01E02.mkv"),
        basename: "The Expanse - S01E02.mkv",
        extension: ".mkv",
        size_bytes: 10,
        mtime_ms: nowMs,
        duration_seconds: null,
        video_codec: null,
        audio_codec: null,
        container: "mkv",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("watch_progress")
      .values([
        {
          user_id: "user-1",
          media_item_id: "episode-1",
          media_file_id: "file-1",
          position_seconds: 2700,
          duration_seconds: 2700,
          completed: 1,
          updated_at: now,
        },
        {
          user_id: "user-1",
          media_item_id: "episode-2",
          media_file_id: "file-2",
          position_seconds: 5,
          duration_seconds: 2700,
          completed: 0,
          updated_at: now,
        },
      ])
      .execute();

    const rows = await tvRows("user-1");

    expect(rows.continueWatching).toEqual([]);
    expect(rows.nextUp.map((episode) => episode.id)).toEqual(["episode-2"]);
    expect(rows.all[0]).toMatchObject({ id: "show-1", episodeCount: 2 });
  });

  test("hides stale continue watching and next up without removing season progress", async () => {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const staleUpdatedAt = new Date(nowMs - 100 * 24 * 60 * 60 * 1000).toISOString();

    await db
      .insertInto("media_item")
      .values([
        {
          id: "episode-2",
          kind: "episode",
          title: "The Big Empty",
          sort_title: "s001e0002",
          season_number: 1,
          episode_number: 2,
          overview: "The crew keeps moving.",
          runtime_seconds: 2700,
          poster_path: "/still-2.jpg",
          release_date: "2015-12-15",
          provider: "tmdb",
          provider_id: "episode-2",
          parent_id: "season-1",
          created_at: now,
          updated_at: now,
        },
        {
          id: "episode-3",
          kind: "episode",
          title: "Remember the Cant",
          sort_title: "s001e0003",
          season_number: 1,
          episode_number: 3,
          overview: "The next unwatched episode.",
          runtime_seconds: 2700,
          poster_path: "/still-3.jpg",
          release_date: "2015-12-16",
          provider: "tmdb",
          provider_id: "episode-3",
          parent_id: "season-1",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("media_file")
      .values([
        {
          id: "file-2",
          library_id: "library-1",
          media_item_id: "episode-2",
          path: path.join(tempDir, "The Expanse/Season 01/The Expanse - S01E02.mkv"),
          basename: "The Expanse - S01E02.mkv",
          extension: ".mkv",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mkv",
          created_at: new Date(nowMs + 1000).toISOString(),
          updated_at: now,
        },
        {
          id: "file-3",
          library_id: "library-1",
          media_item_id: "episode-3",
          path: path.join(tempDir, "The Expanse/Season 01/The Expanse - S01E03.mkv"),
          basename: "The Expanse - S01E03.mkv",
          extension: ".mkv",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mkv",
          created_at: new Date(nowMs + 2000).toISOString(),
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("watch_progress")
      .values([
        {
          user_id: "user-1",
          media_item_id: "episode-1",
          media_file_id: "file-1",
          position_seconds: 2700,
          duration_seconds: 2700,
          completed: 1,
          updated_at: staleUpdatedAt,
        },
        {
          user_id: "user-1",
          media_item_id: "episode-2",
          media_file_id: "file-2",
          position_seconds: 120,
          duration_seconds: 2700,
          completed: 0,
          updated_at: staleUpdatedAt,
        },
      ])
      .execute();

    setContinueMaxAgeDaysForTests(90);
    const rows = await tvRows("user-1");

    expect(rows.continueWatching).toEqual([]);
    expect(rows.nextUp).toEqual([]);

    const season = await getShowSeasonDetail("show-1", "season-1", "user-1");
    expect(season?.season.episodes.find((episode) => episode.id === "episode-2")).toMatchObject({
      progressSeconds: 120,
      completed: false,
    });
  });
});
