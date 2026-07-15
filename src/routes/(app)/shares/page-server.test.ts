import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { expectRejectsToMatchObject } from "$lib/test/async-expect";
import { actions, load } from "./+page.server";

type SharesLoadResult = {
  shares: Array<{
    id: string;
    title: string;
    createdByEmail: string;
    contentHref: string;
  }>;
  page: {
    page: number;
    total: number;
  };
  counts: {
    all: number;
    active: number;
  };
};

describe("shares page server", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-shares-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    const db = await getDb();
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
      .insertInto("media_item")
      .values({
        id: "movie-1",
        kind: "movie",
        title: "Shared Movie",
        sort_title: "shared movie",
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
      .insertInto("media_share")
      .values({
        id: "share-1",
        token: "share-token",
        created_by_user_id: "admin-1",
        kind: "movie",
        media_item_id: "movie-1",
        season_ids: null,
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

  test("loads shares for admins", async () => {
    const data = (await load({
      locals: { user: { id: "admin-1", role: "admin" } },
      url: new URL("http://localhost/shares"),
    } as never)) as SharesLoadResult;

    expect(data.shares).toHaveLength(1);
    expect(data.shares[0]).toMatchObject({
      id: "share-1",
      title: "Shared Movie",
      createdByEmail: "admin@example.com",
      contentHref: "/movies/movie-1",
    });
    expect(data.page.total).toBe(1);
    expect(data.counts.all).toBe(1);
    expect(data.counts.active).toBe(1);
  });

  test("keeps share management admin-only", async () => {
    await expectRejectsToMatchObject(
      load({
        locals: { user: null },
      } as never),
      { status: 403 },
    );

    await expectRejectsToMatchObject(
      load({
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      { status: 403 },
    );
  });

  test("revokes an active share link", async () => {
    const form = new FormData();
    form.set("shareId", "share-1");

    const result = await actions.revokeShare({
      request: new Request("http://localhost/shares", {
        method: "POST",
        body: form,
      }),
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);

    expect(result).toEqual({ revokeSuccess: true });

    const db = await getDb();
    const row = await db
      .selectFrom("media_share")
      .selectAll()
      .where("id", "=", "share-1")
      .executeTakeFirst();
    expect(row?.revoked_at).not.toBeNull();
  });

  test("rejects revoke without a share identifier", async () => {
    const form = new FormData();
    form.set("shareId", "");

    const result = await actions.revokeShare({
      request: new Request("http://localhost/shares", {
        method: "POST",
        body: form,
      }),
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);

    expect(result).toMatchObject({
      status: 400,
      data: { revokeError: expect.any(String) },
    });
  });
});
