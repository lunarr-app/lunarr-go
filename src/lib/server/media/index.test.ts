import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import {
  getMediaFile,
  getMovieDetail,
  getShowDetail,
  movieRows,
  normalizeMoviePage,
  normalizeMovieSort,
  normalizeMovieStatusFilter,
  normalizeShowSort,
  showRows,
  tvRows,
} from ".";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
} from "../db";
import type { Database } from "../db/schema";

describe("movie browse parameters", () => {
  test("normalizes watch-status filters", () => {
    expect(normalizeMovieStatusFilter("watched")).toBe("watched");
    expect(normalizeMovieStatusFilter("unwatched")).toBe("unwatched");
    expect(normalizeMovieStatusFilter("all")).toBe("all");
    expect(normalizeMovieStatusFilter("invalid")).toBe("all");
    expect(normalizeMovieStatusFilter(null)).toBe("all");
  });

  test("normalizes sort options", () => {
    expect(normalizeMovieSort("title")).toBe("title");
    expect(normalizeMovieSort("recent")).toBe("recent");
    expect(normalizeMovieSort("year_desc")).toBe("year_desc");
    expect(normalizeMovieSort("rating")).toBe("rating");
    expect(normalizeMovieSort("unknown")).toBe("title");
    expect(normalizeMovieSort(undefined)).toBe("title");
  });

  test("normalizes show sort options", () => {
    expect(normalizeShowSort("title")).toBe("title");
    expect(normalizeShowSort("recent")).toBe("recent");
    expect(normalizeShowSort("latest")).toBe("latest");
    expect(normalizeShowSort("popular")).toBe("popular");
    expect(normalizeShowSort("unknown")).toBe("title");
  });

  test("normalizes page numbers", () => {
    expect(normalizeMoviePage("2")).toBe(2);
    expect(normalizeMoviePage(3)).toBe(3);
    expect(normalizeMoviePage("0")).toBe(1);
    expect(normalizeMoviePage("-1")).toBe(1);
    expect(normalizeMoviePage("1.5")).toBe(1);
    expect(normalizeMoviePage("bad")).toBe(1);
    expect(normalizeMoviePage(null)).toBe(1);
  });
});

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
        path: path.join(
          tempDir,
          "The Expanse/Season 01/The Expanse - S01E01.mkv",
        ),
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
          path: path.join(
            tempDir,
            "The Expanse/Season 01/The Expanse - S01E02.mkv",
          ),
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
          path: path.join(
            tempDir,
            "The Expanse/Season 01/The Expanse - S01E03.mkv",
          ),
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
      .updateTable("media_item")
      .set({ popularity: 42, vote_average: 8.5 })
      .where("id", "=", "show-1")
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

    expect(rows.continueWatching.map((episode) => episode.id)).toEqual([
      "episode-2",
    ]);
    expect(rows.continueWatching[0]).toMatchObject({
      showTitle: "The Expanse",
      fileId: "file-2",
      progressSeconds: 120,
    });
    expect(rows.nextUp.map((episode) => episode.id)).toEqual(["episode-3"]);
    expect(rows.recentlyAiredShows[0]).toMatchObject({
      id: "show-1",
      latestEpisodeReleaseDate: "2015-12-16",
    });
    expect(rows.popularShows[0]).toMatchObject({
      id: "show-1",
      popularity: 42,
    });
    expect(rows.allShows[0]).toMatchObject({ id: "show-1", episodeCount: 3 });
  });
});

describe("movieRows", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-media-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Browse User",
        email: "browse@example.com",
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
        name: "Movies",
        kind: "movie",
        path: tempDir,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "movie-a",
          kind: "movie",
          title: "Alpha",
          sort_title: "alpha",
          year: 2020,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2020-01-01",
          provider: null,
          provider_id: null,
          parent_id: null,
          popularity: 1,
          vote_average: 6,
          created_at: now,
          updated_at: now,
        },
        {
          id: "movie-b",
          kind: "movie",
          title: "Bravo",
          sort_title: "bravo",
          year: 2022,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2022-01-01",
          provider: null,
          provider_id: null,
          parent_id: null,
          popularity: 5,
          vote_average: 8,
          created_at: now,
          updated_at: now,
        },
        {
          id: "metadata-only",
          kind: "movie",
          title: "Metadata Only",
          sort_title: "metadata only",
          year: 2023,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2023-01-01",
          provider: null,
          provider_id: null,
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "show-a",
          kind: "show",
          title: "Show A",
          sort_title: "show a",
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
        },
      ])
      .execute();
    await db
      .insertInto("media_file")
      .values([
        {
          id: "file-a",
          library_id: "library-1",
          media_item_id: "movie-a",
          path: path.join(tempDir, "Alpha.2020.mp4"),
          basename: "Alpha.2020.mp4",
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
          id: "file-b",
          library_id: "library-1",
          media_item_id: "movie-b",
          path: path.join(tempDir, "Bravo.2022.mp4"),
          basename: "Bravo.2022.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: new Date(nowMs + 1000).toISOString(),
          updated_at: now,
        },
        {
          id: "file-a-alt",
          library_id: "library-1",
          media_item_id: "movie-a",
          path: path.join(tempDir, "Alpha.2020.4k.mp4"),
          basename: "Alpha.2020.4k.mp4",
          extension: ".mp4",
          size_bytes: 20,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: new Date(nowMs + 2000).toISOString(),
          updated_at: now,
        },
        {
          id: "file-show-a",
          library_id: "library-1",
          media_item_id: "show-a",
          path: path.join(tempDir, "Show.A.mp4"),
          basename: "Show.A.mp4",
          extension: ".mp4",
          size_bytes: 30,
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
        media_item_id: "movie-a",
        media_file_id: "file-a",
        position_seconds: 100,
        duration_seconds: 100,
        completed: 1,
        updated_at: now,
      })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("filters by watched state and search text", async () => {
    expect(
      (await movieRows("user-1", "", "watched")).all.map(
        (movie) => movie.title,
      ),
    ).toEqual(["Alpha"]);
    expect(
      (await movieRows("user-1", "", "unwatched")).all.map(
        (movie) => movie.title,
      ),
    ).toEqual(["Bravo"]);
    expect(
      (await movieRows("user-1", "rav", "all")).all.map((movie) => movie.title),
    ).toEqual(["Bravo"]);
  });

  test("treats movie search wildcards as literal text", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values({
        id: "movie-percent",
        kind: "movie",
        title: "100% Real",
        sort_title: "100% real",
        year: 2025,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2025-01-01",
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
        id: "file-percent",
        library_id: "library-1",
        media_item_id: "movie-percent",
        path: path.join(tempDir, "100.Percent.Real.2025.mp4"),
        basename: "100.Percent.Real.2025.mp4",
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

    expect(
      (await movieRows("user-1", "%", "all")).all.map((movie) => movie.title),
    ).toEqual(["100% Real"]);
    expect(
      (await movieRows("user-1", "_", "all")).all.map((movie) => movie.title),
    ).toEqual([]);
  });

  test("sorts the main browse list", async () => {
    await db
      .updateTable("media_item")
      .set({ sort_title: "aardvark" })
      .where("id", "=", "movie-b")
      .execute();

    expect(
      (await movieRows("user-1", "", "all", "title")).all.map(
        (movie) => movie.title,
      ),
    ).toEqual(["Bravo", "Alpha"]);
    expect(
      (await movieRows("user-1", "", "all", "year_desc")).all.map(
        (movie) => movie.title,
      ),
    ).toEqual(["Bravo", "Alpha"]);
    expect(
      (await movieRows("user-1", "", "all", "rating")).all.map(
        (movie) => movie.title,
      ),
    ).toEqual(["Bravo", "Alpha"]);
    expect(
      (await movieRows("user-1", "", "all", "recent")).all.map(
        (movie) => movie.title,
      ),
    ).toEqual(["Alpha", "Bravo"]);
  });

  test("paginates the main browse list", async () => {
    const rows = await movieRows("user-1", "", "all", "title", 2, 1);

    expect(rows.all.map((movie) => movie.title)).toEqual(["Bravo"]);
    expect(rows.allPage).toEqual({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
      hasPrevious: true,
      hasNext: false,
    });
  });

  test("marks a movie watched when any file is completed", async () => {
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-a",
        media_file_id: "file-a-alt",
        position_seconds: 40,
        duration_seconds: 100,
        completed: 0,
        updated_at: new Date(Date.now() + 1000).toISOString(),
      })
      .execute();

    const rows = await movieRows("user-1");
    expect(rows.all.find((movie) => movie.id === "movie-a")).toMatchObject({
      resumeFileId: "file-a-alt",
      progressSeconds: 40,
      durationSeconds: 100,
      completed: true,
    });
    expect(rows.continueWatching.map((movie) => movie.id)).toEqual([]);
    expect(
      (await movieRows("user-1", "", "watched")).all.map((movie) => movie.id),
    ).toEqual(["movie-a"]);
    expect(
      (await movieRows("user-1", "", "unwatched")).all.map((movie) => movie.id),
    ).toEqual(["movie-b"]);
  });

  test("limits shared libraries to selected users while admins retain access", async () => {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values([
        {
          id: "user-2",
          name: "Other User",
          email: "other@example.com",
          role: "user",
          email_verified: 0,
          image: null,
          created_at: nowMs,
          updated_at: nowMs,
        },
        {
          id: "admin-1",
          name: "Admin",
          email: "admin@example.com",
          role: "admin",
          email_verified: 0,
          image: null,
          created_at: nowMs,
          updated_at: nowMs,
        },
      ])
      .execute();
    await db
      .updateTable("library")
      .set({ access_mode: "shared" })
      .where("id", "=", "library-1")
      .execute();
    await db
      .insertInto("library_user")
      .values({
        library_id: "library-1",
        user_id: "user-1",
        created_at: now,
      })
      .execute();

    expect((await movieRows("user-1")).all.map((movie) => movie.id)).toEqual([
      "movie-a",
      "movie-b",
    ]);
    expect((await movieRows("user-2")).all).toEqual([]);
    expect((await movieRows("admin-1")).all.map((movie) => movie.id)).toEqual([
      "movie-a",
      "movie-b",
    ]);
    expect(await getMovieDetail("movie-a", "user-2")).toBeNull();
    expect(await getMediaFile("file-a", "user-2")).toBeUndefined();
  });

  test("returns detail only for playable movie items", async () => {
    expect(await getMovieDetail("movie-a", "user-1")).toMatchObject({
      movie: {
        id: "movie-a",
        title: "Alpha",
      },
      files: [
        {
          id: "file-a-alt",
        },
        {
          id: "file-a",
        },
      ],
    });
    expect(await getMovieDetail("metadata-only", "user-1")).toBeNull();
    expect(await getMovieDetail("show-a", "user-1")).toBeNull();
  });

  test("returns streamable files only for movie items", async () => {
    expect(await getMediaFile("file-a", "user-1")).toMatchObject({
      id: "file-a",
      media_item_id: "movie-a",
      title: "Alpha",
    });
    expect(await getMediaFile("file-show-a", "user-1")).toBeUndefined();
  });
});
