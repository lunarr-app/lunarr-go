import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql, type Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests, type Database } from "$lib/server/db";
import { clearTmdbDetailCachesForTests } from "$lib/server/metadata/tmdb";
import { setSetting } from "$lib/server/settings";
import { actions as showActions, load as showLoad } from "./[id]/+page.server";
import { actions as seasonActions, load as seasonLoad } from "./[id]/seasons/[seasonId]/+page.server";
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
    clearTmdbDetailCachesForTests();
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
        all: [
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
        latest: [
          {
            id: "show-1",
            title: "The Expanse",
          },
        ],
        popular: [
          {
            id: "show-1",
            title: "The Expanse",
          },
        ],
        all: [
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

    const result = await showLoad({
      params: { id: "show-1" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(result).toMatchObject({
      show: { id: "show-1", title: "The Expanse", providerId: "63639", updatedAt: expect.any(String) },
      seasons: [
        {
          id: "season-1",
          seasonNumber: 1,
          title: "Season 1",
          episodeCount: 2,
          playableCount: 2,
        },
      ],
      nextEpisode: {
        id: "episode-1",
        fileId: "file-1",
        seasonNumber: 1,
        episodeNumber: 1,
      },
    });
    const seasonResult = await seasonLoad({
      params: { id: "show-1", seasonId: "1" },
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
        params: { id: "show-1", seasonId: "1" },
        request: new Request("http://localhost/shows/show-1/seasons/1", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/shows/show-1/seasons/1",
    );

    expect(
      await db
        .selectFrom("watch_progress")
        .select(["media_item_id", "media_file_id", sql<number>`completed`.as("completed")])
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
        params: { id: "show-1", seasonId: "1" },
        request: new Request("http://localhost/shows/show-1/seasons/1", {
          method: "POST",
          body: seasonForm,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/shows/show-1/seasons/1",
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
        params: { id: "show-1", seasonId: "1" },
        request: new Request("http://localhost/shows/show-1/seasons/1", {
          method: "POST",
          body: unwatchForm,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/shows/show-1/seasons/1",
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

  test("exposes metadata management flags on show detail load", async () => {
    const userResult = await showLoad({
      params: { id: "show-1" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(userResult).toMatchObject({
      canManageMetadata: false,
      tmdbConfigured: expect.any(Boolean),
      show: {
        provider: "tmdb",
        providerId: "63639",
        updatedAt: expect.any(String),
      },
    });

    const adminResult = await showLoad({
      params: { id: "show-1" },
      locals: { user: { id: "user-1", role: "admin" } },
    } as never);
    expect(adminResult).toMatchObject({
      canManageMetadata: true,
    });
  });

  test("keeps show detail metadata refresh admin-only", async () => {
    const userResult = await showActions.refreshMetadata({
      params: { id: "show-1" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(userResult).toMatchObject({
      status: 403,
      data: {
        metadataError: "Only admins can refresh metadata.",
      },
    });
  });

  test("refreshes a single show from TMDb through the detail action", async () => {
    await setSetting("tmdb_api_key", "saved-api-key");
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/tv")) {
        return Response.json({
          results: [
            {
              id: 63639,
              name: "The Expanse",
              first_air_date: "2015-12-14",
            },
          ],
        });
      }

      if (url.includes("/tv/63639/season/1")) {
        return Response.json({
          id: 60001,
          name: "Season 1",
          overview: "Refreshed season overview.",
          air_date: "2015-12-14",
          poster_path: "/season-refreshed.jpg",
          season_number: 1,
          episodes: [
            {
              id: 70001,
              name: "Dulcinea",
              overview: "Refreshed opener.",
              air_date: "2015-12-14",
              episode_number: 1,
              season_number: 1,
              runtime: 45,
              still_path: "/episode-1-refreshed.jpg",
              vote_average: 8.1,
              vote_count: 10,
            },
          ],
        });
      }

      return Response.json({
        id: 63639,
        name: "The Expanse",
        original_name: "The Expanse",
        overview: "Refreshed from the detail page.",
        first_air_date: "2015-12-14",
        poster_path: "/show-refreshed.jpg",
        backdrop_path: "/backdrop-refreshed.jpg",
        popularity: 100,
        vote_average: 8.4,
        vote_count: 2000,
        status: "Ended",
        genres: [{ id: 10765, name: "Sci-Fi & Fantasy" }],
      });
    }) as typeof fetch;

    await expectRedirect(
      showActions.refreshMetadata({
        params: { id: "show-1" },
        locals: { user: { id: "user-1", role: "admin" } },
      } as never),
      "/shows/show-1",
    );

    const show = await db.selectFrom("media_item").selectAll().where("id", "=", "show-1").executeTakeFirstOrThrow();
    expect(show).toMatchObject({
      provider: "tmdb",
      provider_id: "63639",
      overview: "Refreshed from the detail page.",
      poster_path: "/show-refreshed.jpg",
      backdrop_path: "/backdrop-refreshed.jpg",
      vote_average: 8.4,
    });

    const seasonResult = (await seasonLoad({
      params: { id: "show-1", seasonId: "1" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never)) as {
      season: {
        id: string;
        overview: string | null;
        episodes: Array<{ id: string; overview: string | null; fileId: string | null }>;
      };
      show: { overview: string | null };
    };
    expect(seasonResult.season.episodes).toHaveLength(1);
    expect(seasonResult).toMatchObject({
      show: {
        overview: "Refreshed from the detail page.",
      },
      season: {
        id: "season-1",
        overview: "Refreshed season overview.",
        episodes: [
          {
            id: "episode-1",
            title: "Dulcinea",
            overview: "Refreshed opener.",
            fileId: "file-1",
          },
        ],
      },
    });
  });

  test("redirects legacy season ids to season-number routes", async () => {
    try {
      await seasonLoad({
        params: { id: "show-1", seasonId: "season-1" },
        locals: { user: { id: "user-1", role: "user" } },
      } as never);
      throw new Error("Expected redirect to /shows/show-1/seasons/1.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 301,
        location: "/shows/show-1/seasons/1",
      });
    }
  });
});
