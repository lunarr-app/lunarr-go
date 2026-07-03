import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { GET as showGet } from "./shows/[id]/+server";
import { GET as creditsGet } from "./shows/[id]/credits/+server";
import { GET as overviewGet } from "./shows/[id]/overview/+server";
import { GET as seasonGet } from "./shows/[id]/seasons/[seasonId]/+server";

describe("show catalog API", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function setupShowCatalog() {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-show-catalog-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
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
      .insertInto("library")
      .values({
        id: "library-1",
        name: "Shows",
        kind: "tv",
        access_mode: "shared",
        path: path.join(tempDir, "shows"),
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("library_user")
      .values({
        library_id: "library-1",
        user_id: "user-1",
        created_at: now,
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
          overview: "A system-wide mystery.",
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
        path: path.join(tempDir, "shows", "The Expanse - S01E01.mkv"),
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
  }

  test("overview endpoint returns season stubs without episodes", async () => {
    await setupShowCatalog();

    const response = await overviewGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "show-1" },
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      show: { id: "show-1", title: "The Expanse" },
      seasons: [
        {
          id: "season-1",
          episodeCount: 1,
          playableCount: 1,
          watchedCount: 0,
        },
      ],
    });
    expect(body.seasons[0]).not.toHaveProperty("episodes");
    expect(body).not.toHaveProperty("cast");
  });

  test("credits endpoint returns cast and creators", async () => {
    await setupShowCatalog();
    await (
      await getDb()
    )
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

    const response = await creditsGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "show-1" },
    } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      show: { id: "show-1", title: "The Expanse" },
      cast: [{ name: "Shohreh Aghdashloo", character: "Chrisjen Avasarala" }],
      creators: [],
    });
  });

  test("season endpoint resolves season number and returns episodes", async () => {
    await setupShowCatalog();

    const byNumber = await seasonGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "show-1", seasonId: "1" },
    } as never);
    expect(byNumber.status).toBe(200);
    expect(await byNumber.json()).toMatchObject({
      season: {
        id: "season-1",
        episodes: [{ id: "episode-1", fileId: "file-1" }],
      },
      seasons: [{ id: "season-1", seasonNumber: 1 }],
    });

    const byId = await seasonGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "show-1", seasonId: "season-1" },
    } as never);
    expect(byId.status).toBe(200);

    const missing = await seasonGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "show-1", seasonId: "missing" },
    } as never);
    expect(missing.status).toBe(404);
  });

  test("full show endpoint still returns nested episodes", async () => {
    await setupShowCatalog();

    const response = await showGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "show-1" },
    } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      seasons: [
        {
          id: "season-1",
          episodes: [{ id: "episode-1", title: "Dulcinea" }],
        },
      ],
    });
  });
});
