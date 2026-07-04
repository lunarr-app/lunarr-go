import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import type { Database } from "$lib/server/db/schema";
import { load } from "./+page.server";
import { expectRejectsToMatchObject } from "$lib/test/async-expect";

describe("show landing page server", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-show-landing-"));
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
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "episode-1",
        media_file_id: "file-1",
        position_seconds: 120,
        duration_seconds: 2700,
        completed: 0,
        updated_at: now,
      })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("loads overview season stubs, cast, and resume episode", async () => {
    const result = (await load({
      params: { id: "show-1" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never)) as {
      show: { id: string };
      seasons: Array<{ id: string; episodeCount: number; playableCount: number; watchedCount: number }>;
      cast: Array<{ name: string }>;
      nextEpisode: { id: string; fileId: string; progressSeconds: number } | null;
    };

    expect(result.show.id).toBe("show-1");
    expect(result.seasons[0]).toMatchObject({
      id: "season-1",
      episodeCount: 1,
      playableCount: 1,
      watchedCount: 0,
    });
    expect(result.seasons[0]).not.toHaveProperty("episodes");
    expect(result.cast[0]?.name).toBe("Shohreh Aghdashloo");
    expect(result.nextEpisode).toMatchObject({
      id: "episode-1",
      fileId: "file-1",
      progressSeconds: 120,
    });
  });

  test("returns 404 for missing shows", async () => {
    await expectRejectsToMatchObject(
      load({
        params: { id: "missing" },
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      { status: 404 },
    );
  });
});
