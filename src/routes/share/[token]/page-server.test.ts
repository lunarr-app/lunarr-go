import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import type { Database } from "$lib/server/db/schema";
import type { SharePageData } from "$lib/shares/types";
import { load } from "./+page.server";

async function expectNotFound(operation: unknown) {
  try {
    await operation;
    throw new Error("Expected 404.");
  } catch (error) {
    expect(error).toMatchObject({ status: 404 });
  }
}

describe("guest share page server load", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  let showToken = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-share-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await db
      .insertInto("user")
      .values({
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
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
        name: "Media",
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
          id: "show-1",
          kind: "show",
          title: "Shared Show",
          sort_title: "shared show",
          year: 2026,
          overview: "Show overview",
          runtime_seconds: null,
          poster_path: "/show.jpg",
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
          id: "season-1",
          kind: "season",
          title: "Season 1",
          sort_title: "season 1",
          year: null,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: null,
          provider: null,
          provider_id: null,
          parent_id: "show-1",
          season_number: 1,
          episode_number: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "season-2",
          kind: "season",
          title: "Season 2",
          sort_title: "season 2",
          year: null,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: null,
          provider: null,
          provider_id: null,
          parent_id: "show-1",
          season_number: 2,
          episode_number: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "episode-1",
          kind: "episode",
          title: "Pilot",
          sort_title: "pilot",
          year: null,
          overview: "Episode one",
          runtime_seconds: 1800,
          poster_path: null,
          backdrop_path: null,
          release_date: null,
          provider: null,
          provider_id: null,
          parent_id: "season-1",
          season_number: 1,
          episode_number: 1,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "episode-2",
          kind: "episode",
          title: "Second",
          sort_title: "second",
          year: null,
          overview: null,
          runtime_seconds: 1800,
          poster_path: null,
          backdrop_path: null,
          release_date: null,
          provider: null,
          provider_id: null,
          parent_id: "season-2",
          season_number: 2,
          episode_number: 1,
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
          id: "file-ep-1",
          library_id: "library-1",
          media_item_id: "episode-1",
          path: path.join(tempDir, "ep1.mp4"),
          basename: "ep1.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: 1800,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
        {
          id: "file-ep-2",
          library_id: "library-1",
          media_item_id: "episode-2",
          path: path.join(tempDir, "ep2.mp4"),
          basename: "ep2.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: 1800,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    showToken = "season-scoped-token";
    await db
      .insertInto("media_share")
      .values({
        id: "share-show",
        token: showToken,
        created_by_user_id: "admin-1",
        kind: "show",
        media_item_id: "show-1",
        season_ids: JSON.stringify(["season-1"]),
        expires_at: expiresAt,
        revoked_at: null,
        created_at: now,
      })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns season-scoped show data for active token", async () => {
    const result = (await load({ params: { token: showToken } } as never)) as { share: SharePageData };
    expect(result.share.kind).toBe("show");
    if (result.share.kind === "show") {
      expect(result.share.seasons).toHaveLength(1);
      expect(result.share.seasons[0]?.id).toBe("season-1");
      expect(result.share.seasons[0]?.episodes.map((episode: { id: string }) => episode.id)).toEqual(["episode-1"]);
    }
  });

  test("throws 404 for missing and expired tokens", async () => {
    await expectNotFound(load({ params: { token: "missing-token" } } as never));

    const now = new Date().toISOString();
    await db
      .insertInto("media_share")
      .values({
        id: "share-expired",
        token: "expired-token",
        created_by_user_id: "admin-1",
        kind: "show",
        media_item_id: "show-1",
        season_ids: JSON.stringify(["season-1"]),
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        revoked_at: null,
        created_at: now,
      })
      .execute();

    await expectNotFound(load({ params: { token: "expired-token" } } as never));
  });
});
