import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { createApiKeyForUserId } from "$lib/server/auth/api-keys";
import { resetAuthForTests, sessionHeadersFor } from "$lib/server/auth/test/setup";

describe("API key routes", () => {
  let tempDir: string | undefined;
  let sessionHeaders: Headers;

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
    const user = {
      id: "user-1",
      name: "User",
      email: "user@example.com",
      role: "user" as const,
    };
    await db
      .insertInto("user")
      .values({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await resetAuthForTests();
    sessionHeaders = await sessionHeadersFor(user);
    return user;
  }

  async function setupSecondUser() {
    const db = await getDb();
    const now = Date.now();
    const user = {
      id: "user-2",
      name: "Other",
      email: "other@example.com",
      role: "user" as const,
    };
    await db
      .insertInto("user")
      .values({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    return {
      user,
      sessionHeaders: await sessionHeadersFor(user),
    };
  }

  test("creates, lists, and revokes personal API keys", async () => {
    const user = await setupUser();
    const { GET, POST } = await import("./+server");
    const { DELETE } = await import("./[id]/+server");

    const created = await POST({
      request: new Request("http://localhost/api/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "iPhone", expiresIn: 60 }),
        headers: {
          "content-type": "application/json",
          cookie: sessionHeaders.get("cookie") ?? "",
        },
      }),
      locals: { user },
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
      request: new Request("http://localhost/api/api-keys", {
        headers: sessionHeaders,
      }),
      locals: { user },
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
      request: new Request(`http://localhost/api/api-keys/${createdBody.apiKey.id}`, {
        headers: sessionHeaders,
      }),
      params: { id: createdBody.apiKey.id },
      locals: { user },
    } as never);
    expect(deleted.status).toBe(200);

    const afterDelete = await GET({
      request: new Request("http://localhost/api/api-keys", {
        headers: sessionHeaders,
      }),
      locals: { user },
    } as never);
    expect(await afterDelete.json()).toEqual({ apiKeys: [] });
  });

  test("rejects listing API keys without session cookies", async () => {
    const user = await setupUser();
    const { GET } = await import("./+server");

    const response = await GET({
      request: new Request("http://localhost/api/api-keys"),
      locals: { user },
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ detail: "Unauthorized" });
  });

  test("does not revoke another user's API key", async () => {
    const user = await setupUser();
    const other = await setupSecondUser();
    const { DELETE } = await import("./[id]/+server");
    const created = await createApiKeyForUserId({
      userId: user.id,
      name: "Mine",
    });

    const response = await DELETE({
      request: new Request(`http://localhost/api/api-keys/${created.apiKey.id}`, {
        headers: other.sessionHeaders,
      }),
      params: { id: created.apiKey.id },
      locals: { user: other.user },
    } as never);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ detail: "API key not found." });
  });
});
