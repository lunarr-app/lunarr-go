import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { resetAuthForTests, sessionHeadersFor } from "$lib/server/auth/test/setup";

describe("users API routes", () => {
  let tempDir: string;
  let adminHeaders: Headers;
  const admin = { id: "admin-1", name: "Admin", email: "admin@example.com", role: "admin" as const };
  const viewer = { id: "user-1", name: "Viewer", email: "viewer@example.com", role: "user" as const };

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-users-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    const db = await getDb();
    const now = Date.now();
    await db
      .insertInto("user")
      .values([
        {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          email_verified: 0,
          image: null,
          banned: 0,
          ban_reason: null,
          ban_expires: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: viewer.id,
          name: viewer.name,
          email: viewer.email,
          role: viewer.role,
          email_verified: 0,
          image: null,
          banned: 0,
          ban_reason: null,
          ban_expires: null,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await resetAuthForTests();
    adminHeaders = await sessionHeadersFor(admin);
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  function requestHeaders(headers: Headers = adminHeaders) {
    return { cookie: headers.get("cookie") ?? "" };
  }

  test("lists users for admins only", async () => {
    const { GET } = await import("./+server");

    const unauthorized = await GET({ locals: {}, request: new Request("http://localhost/api/users") } as never);
    expect(unauthorized.status).toBe(401);

    const forbidden = await GET({
      locals: { user: viewer },
      request: new Request("http://localhost/api/users"),
    } as never);
    expect(forbidden.status).toBe(403);

    const response = await GET({
      locals: { user: admin },
      request: new Request("http://localhost/api/users", { headers: requestHeaders() }),
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.users).toHaveLength(2);
  });

  test("keeps user updates and deletes admin-only", async () => {
    const { PATCH, DELETE } = await import("./[id]/+server");
    const patchRequest = new Request(`http://localhost/api/users/${viewer.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...requestHeaders(),
      },
      body: JSON.stringify({ role: "admin" }),
    });

    const forbiddenPatch = await PATCH({
      params: { id: viewer.id },
      request: patchRequest,
      locals: { user: viewer },
    } as never);
    expect(forbiddenPatch.status).toBe(403);

    const forbiddenDelete = await DELETE({
      params: { id: viewer.id },
      request: new Request(`http://localhost/api/users/${viewer.id}`, { headers: requestHeaders() }),
      locals: { user: viewer },
    } as never);
    expect(forbiddenDelete.status).toBe(403);
  });

  test("creates, updates, and deletes users", async () => {
    const { GET, POST } = await import("./+server");
    const { PATCH, DELETE } = await import("./[id]/+server");

    const created = await POST({
      request: new Request("http://localhost/api/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...requestHeaders(),
        },
        body: JSON.stringify({
          name: "Created",
          email: "created@example.com",
          password: "password123",
          role: "user",
        }),
      }),
      locals: { user: admin },
    } as never);
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.user.email).toBe("created@example.com");

    const updated = await PATCH({
      params: { id: createdBody.user.id },
      request: new Request(`http://localhost/api/users/${createdBody.user.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...requestHeaders(),
        },
        body: JSON.stringify({ role: "admin" }),
      }),
      locals: { user: admin },
    } as never);
    expect(updated.status).toBe(200);
    expect((await updated.json()).user.role).toBe("admin");

    const deleted = await DELETE({
      params: { id: createdBody.user.id },
      request: new Request(`http://localhost/api/users/${createdBody.user.id}`, { headers: requestHeaders() }),
      locals: { user: admin },
    } as never);
    expect(deleted.status).toBe(204);

    const listed = await GET({
      locals: { user: admin },
      request: new Request("http://localhost/api/users", { headers: requestHeaders() }),
    } as never);
    const listedBody = await listed.json();
    expect(listedBody.users).toHaveLength(2);
  });

  test("rejects self deletion", async () => {
    const { DELETE } = await import("./[id]/+server");
    const response = await DELETE({
      params: { id: admin.id },
      request: new Request(`http://localhost/api/users/${admin.id}`, { headers: requestHeaders() }),
      locals: { user: admin },
    } as never);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("yourself");
  });
});
