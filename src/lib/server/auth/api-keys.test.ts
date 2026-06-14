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
import { createApiKey, listApiKeys } from "./api-keys";
import { createApiKeyForUser } from "./test/create-api-key-for-user";
import { mockAppServerForAuthTests } from "./test/app-server-mock";
import { resetAuthForTests } from "./test/reset-auth-for-tests";
import { sessionHeadersFor } from "./test/session-headers";

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
    await resetAuthForTests();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates expiring keys through Better Auth with adapter-safe expiry timestamps", async () => {
    const db = await getDb();
    const before = Date.now();
    const { apiKey } = await createApiKeyForUser({
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

  test("requires session headers to create API keys", async () => {
    await expect(createApiKey({ headers: new Headers() })).rejects.toThrow(
      "Unauthorized",
    );
  });

  test("creates keys for the signed-in user from session headers", async () => {
    const sessionHeaders = await sessionHeadersFor({
      id: "user-1",
      email: "user@example.com",
    });

    const created = await createApiKey({
      headers: sessionHeaders,
      name: "Phone",
    });

    expect(created.token.startsWith("lunarr_")).toBe(true);
    expect(await listApiKeys(sessionHeaders)).toEqual([
      {
        ...created.apiKey,
        tokenPrefix: created.token.slice(0, 18),
      },
    ]);
  });
});
