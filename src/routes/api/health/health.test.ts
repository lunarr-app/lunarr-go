import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { APP_VERSION } from "$lib/server/version";
import { GET } from "./+server";

describe("GET /api/health", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-health-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
  });

  afterAll(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns ok and version without authentication", async () => {
    const response = await GET({ locals: { user: null } } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      setupComplete: false,
      version: APP_VERSION,
    });
  });

  test("reports setupComplete after the first user exists", async () => {
    const db = await getDb();
    const now = Date.now();
    await db
      .insertInto("user")
      .values({
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const response = await GET({ locals: { user: null } } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      setupComplete: true,
      version: APP_VERSION,
    });
  });
});
