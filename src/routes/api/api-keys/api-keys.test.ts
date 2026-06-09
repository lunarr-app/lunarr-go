import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
} from "$lib/server/db";

mock.module("$app/server", () => ({
  getRequestEvent: () => {
    throw new Error("No request event is available in this direct route test.");
  },
}));

describe("API key routes", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function setupUser() {
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
  }

  test("creates, lists, and revokes personal API keys", async () => {
    await setupUser();
    const { GET, POST } = await import("./+server");
    const { DELETE } = await import("./[id]/+server");

    const created = await POST({
      request: new Request("http://localhost/api/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "iPhone", expiresIn: 60 }),
        headers: { "content-type": "application/json" },
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.token.startsWith("lunarr_")).toBe(true);
    expect(createdBody.apiKey).toMatchObject({
      name: "iPhone",
      tokenPrefix: createdBody.token.slice(0, 18),
      expiresAt: expect.any(String),
    });

    const listed = await GET({
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(await listed.json()).toEqual({
      apiKeys: [
        {
          ...createdBody.apiKey,
          tokenPrefix: createdBody.token.slice(0, 18),
        },
      ],
    });

    const deleted = await DELETE({
      params: { id: createdBody.apiKey.id },
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(deleted.status).toBe(200);

    const afterDelete = await GET({
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(await afterDelete.json()).toEqual({ apiKeys: [] });
  });
});
