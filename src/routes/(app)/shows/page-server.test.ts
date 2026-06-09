import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql, type Kysely } from "kysely";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
  type Database,
} from "$lib/server/db";
import { load as showLoad } from "./[id]/+page.server";
import {
  actions as seasonActions,
  load as seasonLoad,
} from "./[id]/seasons/[seasonId]/+page.server";
import { load as showsLoad } from "./+page.server";

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

describe("shows page server", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-shows-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Show User",
        email: "show-page@example.com",
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
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("loads shows from query parameters", async () => {
    const result = await showsLoad({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/shows?q=exp&sort=latest"),
    } as never);

    expect(result).toMatchObject({
      query: "exp",
      sort: "latest",
      rows: {
        allShows: [
          {
            id: "show-1",
            title: "The Expanse",
            episodeCount: 1,
            seasonCount: 1,
          },
        ],
      },
    });
  });

  test("loads TV rails for the shows page", async () => {
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

    const result = await showsLoad({
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/shows"),
    } as never);

    expect(result).toMatchObject({
      rows: {
        continueWatching: [
          {
            id: "episode-1",
            showTitle: "The Expanse",
            fileId: "file-1",
            progressSeconds: 120,
          },
        ],
        recentlyAiredShows: [
          {
            id: "show-1",
            title: "The Expanse",
          },
        ],
        popularShows: [
          {
            id: "show-1",
            title: "The Expanse",
          },
        ],
        allShows: [
          {
            id: "show-1",
            title: "The Expanse",
          },
        ],
      },
    });
  });

  test("loads show detail and marks episodes and seasons watched", async () => {
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
        overview: "The second episode.",
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
        created_at: now,
        updated_at: now,
      })
      .execute();

    const result = await showLoad({
      params: { id: "show-1" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(result).toMatchObject({
      show: { id: "show-1", title: "The Expanse" },
      seasons: [
        {
          id: "season-1",
          episodes: [
            {
              id: "episode-1",
              title: "Dulcinea",
              fileId: "file-1",
            },
            {
              id: "episode-2",
              title: "The Big Empty",
              fileId: "file-2",
            },
          ],
        },
      ],
    });
    const seasonResult = await seasonLoad({
      params: { id: "show-1", seasonId: "season-1" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(seasonResult).toMatchObject({
      show: { id: "show-1", title: "The Expanse" },
      season: {
        id: "season-1",
        episodes: [
          {
            id: "episode-1",
            title: "Dulcinea",
            fileId: "file-1",
          },
          {
            id: "episode-2",
            title: "The Big Empty",
            fileId: "file-2",
          },
        ],
      },
    });

    const form = new FormData();
    form.set("episodeId", "episode-1");
    form.set("fileId", "file-1");
    form.set("completed", "true");

    await expectRedirect(
      seasonActions.watched({
        params: { id: "show-1", seasonId: "season-1" },
        request: new Request("http://localhost/shows/show-1/seasons/season-1", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/shows/show-1/seasons/season-1",
    );

    expect(
      await db
        .selectFrom("watch_progress")
        .select([
          "media_item_id",
          "media_file_id",
          sql<number>`completed`.as("completed"),
        ])
        .where("media_item_id", "=", "episode-1")
        .executeTakeFirst(),
    ).toEqual({
      media_item_id: "episode-1",
      media_file_id: "file-1",
      completed: 1,
    });

    const seasonForm = new FormData();
    seasonForm.set("completed", "true");

    await expectRedirect(
      seasonActions.seasonWatched({
        params: { id: "show-1", seasonId: "season-1" },
        request: new Request("http://localhost/shows/show-1/seasons/season-1", {
          method: "POST",
          body: seasonForm,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/shows/show-1/seasons/season-1",
    );

    expect(
      await db
        .selectFrom("watch_progress")
        .select(["media_item_id", sql<number>`completed`.as("completed")])
        .where("media_item_id", "in", ["episode-1", "episode-2"])
        .orderBy("media_item_id", "asc")
        .execute(),
    ).toEqual([
      { media_item_id: "episode-1", completed: 1 },
      { media_item_id: "episode-2", completed: 1 },
    ]);

    const unwatchForm = new FormData();
    unwatchForm.set("completed", "false");

    await expectRedirect(
      seasonActions.seasonWatched({
        params: { id: "show-1", seasonId: "season-1" },
        request: new Request("http://localhost/shows/show-1/seasons/season-1", {
          method: "POST",
          body: unwatchForm,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/shows/show-1/seasons/season-1",
    );

    expect(
      await db
        .selectFrom("watch_progress")
        .select(["media_item_id", sql<number>`completed`.as("completed")])
        .where("media_item_id", "in", ["episode-1", "episode-2"])
        .orderBy("media_item_id", "asc")
        .execute(),
    ).toEqual([
      { media_item_id: "episode-1", completed: 0 },
      { media_item_id: "episode-2", completed: 0 },
    ]);
  });
});
