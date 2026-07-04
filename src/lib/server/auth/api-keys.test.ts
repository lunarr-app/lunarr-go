import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { createApiKey, listApiKeys, apiKeyHttpStatus, ApiKeyError } from "./api-keys";
import { createApiKeyForUserId } from "$lib/server/auth/api-keys";
import { resetAuthForTests, sessionHeadersFor } from "./test/setup";
import { expectRejectsToThrow } from "$lib/test/async-expect";

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
    const { apiKey } = await createApiKeyForUserId({
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
    expect(apiKey.expiresAt).toBe(new Date(String(row.expires_at)).toISOString());
  });

  test("requires session headers to create API keys", async () => {
    await expectRejectsToThrow(createApiKey({ headers: new Headers() }), "Unauthorized");
  });

  test("maps Better Auth 401 status to HTTP 401 on mapped errors", async () => {
    try {
      await listApiKeys(new Headers());
      throw new Error("Expected listApiKeys to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiKeyError);
      expect(apiKeyHttpStatus(error)).toBe(401);
    }
  });

  test("preserves status-only unauthorized errors when mapping", () => {
    const error = new ApiKeyError("Session required", 401);
    expect(apiKeyHttpStatus(error)).toBe(401);
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
