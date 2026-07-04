import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import {
  assertShareAllowsPlayableItem,
  createShare,
  cleanupExpiredShares,
  getSharePageData,
  getShareSeasonData,
  listSharesForMedia,
  resolveShare,
  revokeShare,
} from "./index";

describe("media shares", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-shares-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
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
          id: "movie-1",
          kind: "movie",
          title: "Shared Movie",
          sort_title: "shared movie",
          year: 2026,
          overview: "Movie overview",
          runtime_seconds: 3600,
          poster_path: "/poster.jpg",
          backdrop_path: "/backdrop.jpg",
          release_date: "2026-01-01",
          provider: null,
          provider_id: null,
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
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
          id: "file-movie",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "movie.mp4"),
          basename: "movie.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: 3600,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
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
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates movie share and resolves active token", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const share = await createShare({
      userId: "admin-1",
      kind: "movie",
      mediaItemId: "movie-1",
      seasonIds: null,
      expiresAt,
    });

    expect(share.active).toBe(true);
    expect(share.sharePath).toMatch(/^\/share\//);

    const resolved = await resolveShare(share.token);
    expect(resolved?.media_item_id).toBe("movie-1");
  });

  test("scopes show shares to selected seasons", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const share = await createShare({
      userId: "admin-1",
      kind: "show",
      mediaItemId: "show-1",
      seasonIds: ["season-1"],
      expiresAt,
    });
    const resolved = await resolveShare(share.token);
    expect(resolved).not.toBeNull();

    await assertShareAllowsPlayableItem(resolved!, "episode-1");
    await expect(assertShareAllowsPlayableItem(resolved!, "episode-2")).rejects.toThrow(
      "This share does not include the requested season.",
    );
  });

  test("revoked and expired shares are not resolved", async () => {
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    const expired = await createShare({
      userId: "admin-1",
      kind: "movie",
      mediaItemId: "movie-1",
      seasonIds: null,
      expiresAt: expiredAt,
    });
    expect(await resolveShare(expired.token)).toBeNull();

    const activeAt = new Date(Date.now() + 60_000).toISOString();
    const active = await createShare({
      userId: "admin-1",
      kind: "movie",
      mediaItemId: "movie-1",
      seasonIds: null,
      expiresAt: activeAt,
    });
    await revokeShare({ shareId: active.id });
    expect(await resolveShare(active.token)).toBeNull();
  });

  test("builds guest page data for movie and filtered show shares", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const movieShare = await createShare({
      userId: "admin-1",
      kind: "movie",
      mediaItemId: "movie-1",
      seasonIds: null,
      expiresAt,
    });
    const moviePage = await getSharePageData(movieShare.token);
    expect(moviePage?.kind).toBe("movie");
    if (moviePage?.kind === "movie") {
      expect(moviePage.movieId).toBe("movie-1");
      expect(moviePage.fileId).toBe("file-movie");
    }

    const showShare = await createShare({
      userId: "admin-1",
      kind: "show",
      mediaItemId: "show-1",
      seasonIds: ["season-1"],
      expiresAt,
    });
    const showPage = await getSharePageData(showShare.token);
    expect(showPage?.kind).toBe("show");
    if (showPage?.kind === "show") {
      expect(showPage.seasons).toHaveLength(1);
      expect(showPage.seasons[0]?.id).toBe("season-1");
      expect(showPage.seasons[0]?.playableCount).toBe(1);
      expect(showPage.seasons[0]).not.toHaveProperty("episodes");
    }

    const seasonPage = await getShareSeasonData(showShare.token, "season-1");
    expect(seasonPage?.episodes[0]?.id).toBe("episode-1");
    expect(await getShareSeasonData(showShare.token, "season-2")).toBeNull();
  });

  test("lists shares for a media item", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await createShare({
      userId: "admin-1",
      kind: "movie",
      mediaItemId: "movie-1",
      seasonIds: null,
      expiresAt,
    });
    const shares = await listSharesForMedia("movie-1");
    expect(shares.length).toBeGreaterThan(0);
    expect(shares[0]?.mediaItemId).toBe("movie-1");
  });

  test("keeps revoked shares in history and deletes shares expired more than 30 days ago", async () => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const futureExpiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    const staleExpiresAt = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();

    await db
      .insertInto("media_share")
      .values([
        {
          id: "share-stale",
          token: "stale-token",
          created_by_user_id: "admin-1",
          kind: "movie",
          media_item_id: "movie-1",
          season_ids: null,
          expires_at: staleExpiresAt,
          revoked_at: null,
          created_at: nowIso,
        },
        {
          id: "share-revoked",
          token: "revoked-token",
          created_by_user_id: "admin-1",
          kind: "movie",
          media_item_id: "movie-1",
          season_ids: null,
          expires_at: futureExpiresAt,
          revoked_at: nowIso,
          created_at: nowIso,
        },
      ])
      .execute();

    expect(await cleanupExpiredShares({ now })).toBe(1);

    const shares = await listSharesForMedia("movie-1");
    expect(shares.some((share) => share.id === "share-stale")).toBe(false);
    expect(shares.some((share) => share.id === "share-revoked")).toBe(true);
    expect(await resolveShare("stale-token")).toBeNull();
    expect(await resolveShare("revoked-token")).toBeNull();
  });
});
