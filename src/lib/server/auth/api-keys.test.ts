import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
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

mock.module("$app/environment", () => ({
  building: false,
}));

mock.module("$app/server", () => ({
  getRequestEvent: () => {
    throw new Error("No request event is available in this direct auth test.");
  },
}));

describe("API keys", () => {
  let tempDir: string;

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("stores expiring keys with ISO timestamps for Better Auth cleanup", async () => {
    const db = await getDb();
    const before = Date.now();
    const { token, apiKey } = await createApiKey({ userId: "user-1", expiresIn: 7200 });
    const row = await db
      .selectFrom("apikey")
      .select(["expires_at"])
      .where("id", "=", apiKey.id)
      .executeTakeFirstOrThrow();

    expect(typeof row.expires_at).toBe("string");
    expect(Date.parse(String(row.expires_at))).toBeGreaterThanOrEqual(before + 7200 * 1000);
    expect(apiKey.expiresAt).toBe(new Date(String(row.expires_at)).toISOString());

    const { auth } = await import("./index");
    await auth.api.getSession({ headers: new Headers({ "x-api-key": token }) });
    await auth.api.getSession({ headers: new Headers({ "x-api-key": token }) });

    const after = await db
      .selectFrom("apikey")
      .select(["id"])
      .where("id", "=", apiKey.id)
      .executeTakeFirst();
    expect(after).toBeTruthy();
  });
});
