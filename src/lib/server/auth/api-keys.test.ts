import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
} from "$lib/server/db";
import { createApiKey } from "./api-keys";
import { mockAppServerForAuthTests } from "./test/app-server-mock";
import { loadAuthModule } from "./test/load-auth-module";

mock.module("$app/environment", () => ({
  building: false,
}));

mock.module("$app/server", () => mockAppServerForAuthTests());

describe("API keys", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-api-keys-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    const db = await getDb();
    const now = Date.now();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "User",
        email: "user@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    const { resetAuthForTests } = await loadAuthModule();
    await resetAuthForTests();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates expiring keys through Better Auth with adapter-safe expiry timestamps", async () => {
    const db = await getDb();
    const before = Date.now();
    const { apiKey } = await createApiKey({
      userId: "user-1",
      expiresIn: 7200,
    });
    const row = await db
      .selectFrom("apikey")
      .select(["expires_at"])
      .where("id", "=", apiKey.id)
      .executeTakeFirstOrThrow();

    const expiresAt = Date.parse(String(row.expires_at));
    expect(Number.isFinite(expiresAt)).toBe(true);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 7200 * 1000);
    expect(apiKey.expiresAt).toBe(
      new Date(String(row.expires_at)).toISOString(),
    );
  });
});
