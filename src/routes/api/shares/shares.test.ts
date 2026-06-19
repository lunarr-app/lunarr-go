import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import type { Database } from "$lib/server/db/schema";
import {
  resetGuestShareRateLimitsForTests,
  setGuestShareRateLimitOverridesForTests,
} from "$lib/server/shares/rate-limit";
import { GET as shareGet } from "../share/[token]/+server";
import { GET as sharePlaybackGet } from "../share/[token]/playback/[mediaItemId]/+server";
import { GET as sharesGet, POST as sharesPost } from "./+server";
import { DELETE as shareDelete } from "./[id]/+server";

describe("/api/shares admin routes", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  const adminUser = {
    id: "admin-1",
    name: "Admin",
    email: "admin@example.com",
    role: "admin",
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const regularUser = { ...adminUser, id: "user-1", role: "user", email: "user@example.com" };

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-shares-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values([
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
        {
          id: "user-1",
          name: "User",
          email: "user@example.com",
          role: "user",
          email_verified: 0,
          image: null,
          created_at: nowMs,
          updated_at: nowMs,
        },
      ])
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
      .values({
        id: "movie-1",
        kind: "movie",
        title: "Movie",
        sort_title: "movie",
        year: 2026,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2026-01-01",
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
        id: "file-1",
        library_id: "library-1",
        media_item_id: "movie-1",
        path: path.join(tempDir, "movie.mp4"),
        basename: "movie.mp4",
        extension: ".mp4",
        size_bytes: 10,
        mtime_ms: nowMs,
        duration_seconds: 120,
        video_codec: null,
        audio_codec: null,
        container: "mp4",
        created_at: now,
        updated_at: now,
      })
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("rejects unauthenticated and non-admin callers", async () => {
    const unauth = await sharesPost({
      request: new Request("http://localhost/api/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "movie", mediaItemId: "movie-1", expiresInSeconds: 3600 }),
      }),
      locals: { user: null },
    } as never);
    expect(unauth.status).toBe(401);

    const forbidden = await sharesPost({
      request: new Request("http://localhost/api/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "movie", mediaItemId: "movie-1", expiresInSeconds: 3600 }),
      }),
      locals: { user: regularUser },
    } as never);
    expect(forbidden.status).toBe(403);
  });

  test("creates share with expiresAt body", async () => {
    const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const created = await sharesPost({
      request: new Request("http://localhost/api/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "movie", mediaItemId: "movie-1", expiresAt }),
      }),
      locals: { user: adminUser },
    } as never);
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.share.expiresAt).toBe(expiresAt);
  });

  test("creates share with long custom duration", async () => {
    const created = await sharesPost({
      request: new Request("http://localhost/api/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "movie", mediaItemId: "movie-1", expiresInSeconds: 365 * 24 * 60 * 60 }),
      }),
      locals: { user: adminUser },
    } as never);
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(Date.parse(body.share.expiresAt)).toBeGreaterThan(Date.now() + 364 * 24 * 60 * 60 * 1000);
  });

  test("creates, lists, and revokes shares for admins", async () => {
    const created = await sharesPost({
      request: new Request("http://localhost/api/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "movie", mediaItemId: "movie-1", expiresInSeconds: 3600 }),
      }),
      locals: { user: adminUser },
    } as never);
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.share.sharePath).toMatch(/^\/share\//);

    const listed = await sharesGet({
      url: new URL("http://localhost/api/shares?mediaItemId=movie-1"),
      locals: { user: adminUser },
    } as never);
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody.shares.length).toBeGreaterThan(0);

    const revoked = await shareDelete({
      params: { id: createdBody.share.id },
      locals: { user: adminUser },
    } as never);
    expect(revoked.status).toBe(200);
  });

  test("lists all shares for admins when mediaItemId is omitted", async () => {
    const created = await sharesPost({
      request: new Request("http://localhost/api/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "movie", mediaItemId: "movie-1", expiresInSeconds: 3600 }),
      }),
      locals: { user: adminUser },
    } as never);
    expect(created.status).toBe(201);
    const createdBody = await created.json();

    const listed = await sharesGet({
      url: new URL("http://localhost/api/shares"),
      locals: { user: adminUser },
    } as never);
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody.shares.length).toBeGreaterThan(0);
    expect(listedBody.shares[0]).toMatchObject({
      id: createdBody.share.id,
      title: "Movie",
      createdByEmail: "admin@example.com",
      contentHref: "/movies/movie-1",
    });
  });
});

describe("guest share routes", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  let token = "";
  let showToken = "";
  const guestEventBase = {
    locals: { user: null },
    getClientAddress: () => "127.0.0.1",
  };

  beforeEach(async () => {
    resetGuestShareRateLimitsForTests();
    setGuestShareRateLimitOverridesForTests(null);
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-guest-share-"));
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
          id: "movie-1",
          kind: "movie",
          title: "Movie",
          sort_title: "movie",
          year: 2026,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
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
          title: "Show",
          sort_title: "show",
          year: 2026,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
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
          overview: null,
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
          id: "file-1",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "movie.mp4"),
          basename: "movie.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: 120,
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
    token = "guest-share-token";
    showToken = "guest-show-token";
    await db
      .insertInto("media_share")
      .values([
        {
          id: "share-1",
          token,
          created_by_user_id: "admin-1",
          kind: "movie",
          media_item_id: "movie-1",
          season_ids: null,
          expires_at: expiresAt,
          revoked_at: null,
          created_at: now,
        },
        {
          id: "share-2",
          token: showToken,
          created_by_user_id: "admin-1",
          kind: "show",
          media_item_id: "show-1",
          season_ids: JSON.stringify(["season-1"]),
          expires_at: expiresAt,
          revoked_at: null,
          created_at: now,
        },
      ])
      .execute();
  });

  afterEach(async () => {
    resetGuestShareRateLimitsForTests();
    setGuestShareRateLimitOverridesForTests(null);
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns public share page data and guest playback without auth", async () => {
    const page = await shareGet({
      params: { token },
      ...guestEventBase,
    } as never);
    expect(page.status).toBe(200);
    const pageBody = await page.json();
    expect(pageBody.share.kind).toBe("movie");

    const playback = await sharePlaybackGet({
      params: { token, mediaItemId: "movie-1" },
      url: new URL("http://localhost/api/share/guest-share-token/playback/movie-1"),
      ...guestEventBase,
    } as never);
    expect(playback.status).toBe(200);
    const playbackBody = await playback.json();
    expect(playbackBody.item.id).toBe("movie-1");
    expect(playbackBody.playback.streamUrl).toContain("remoteToken=");
    expect(playbackBody.playback.streamUrl).toContain("shareToken=");
  });

  test("returns 404 for expired, revoked, and invalid share tokens", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("media_share")
      .values([
        {
          id: "share-expired",
          token: "expired-token",
          created_by_user_id: "admin-1",
          kind: "movie",
          media_item_id: "movie-1",
          season_ids: null,
          expires_at: new Date(Date.now() - 60_000).toISOString(),
          revoked_at: null,
          created_at: now,
        },
        {
          id: "share-revoked",
          token: "revoked-token",
          created_by_user_id: "admin-1",
          kind: "movie",
          media_item_id: "movie-1",
          season_ids: null,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          revoked_at: now,
          created_at: now,
        },
      ])
      .execute();

    for (const invalidToken of ["expired-token", "revoked-token", "missing-token"]) {
      const response = await shareGet({
        params: { token: invalidToken },
        ...guestEventBase,
      } as never);
      expect(response.status).toBe(404);
    }
  });

  test("returns 403 for out-of-scope episode playback", async () => {
    const playback = await sharePlaybackGet({
      params: { token: showToken, mediaItemId: "episode-2" },
      url: new URL(`http://localhost/api/share/${showToken}/playback/episode-2`),
      ...guestEventBase,
    } as never);
    expect(playback.status).toBe(403);
  });

  test("rate limits guest share resolve and playback endpoints", async () => {
    setGuestShareRateLimitOverridesForTests({ "share:resolve": 2, "share:playback": 2 });

    const first = await shareGet({ params: { token }, ...guestEventBase } as never);
    const second = await shareGet({ params: { token }, ...guestEventBase } as never);
    const third = await shareGet({ params: { token }, ...guestEventBase } as never);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    const limitedBody = await third.json();
    expect(limitedBody.error).toBe("Too many requests. Try again later.");

    resetGuestShareRateLimitsForTests();
    setGuestShareRateLimitOverridesForTests({ "share:playback": 2 });

    const playbackUrl = new URL(`http://localhost/api/share/${token}/playback/movie-1`);
    const playbackFirst = await sharePlaybackGet({
      params: { token, mediaItemId: "movie-1" },
      url: playbackUrl,
      ...guestEventBase,
    } as never);
    const playbackSecond = await sharePlaybackGet({
      params: { token, mediaItemId: "movie-1" },
      url: playbackUrl,
      ...guestEventBase,
    } as never);
    const playbackThird = await sharePlaybackGet({
      params: { token, mediaItemId: "movie-1" },
      url: playbackUrl,
      ...guestEventBase,
    } as never);
    expect(playbackFirst.status).toBe(200);
    expect(playbackSecond.status).toBe(200);
    expect(playbackThird.status).toBe(429);
  });
});
