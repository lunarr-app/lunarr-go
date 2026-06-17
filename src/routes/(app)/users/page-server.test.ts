import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { resetAuthForTests, sessionHeadersFor } from "$lib/server/auth/test/setup";
import { expectRejectsToMatchObject } from "$lib/test/async-expect";
import { actions, load } from "./+page.server";

type UsersLoadResult = {
  users: unknown[];
  currentUserId: string;
};

async function expectRedirect(operation: unknown, location: string) {
  try {
    await operation;
    throw new Error(`Expected redirect to ${location}.`);
  } catch (error) {
    expect(error).toMatchObject({
      status: 303,
      location,
    });
  }
}

describe("users page server", () => {
  let tempDir: string;
  let adminHeaders: Headers;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-users-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    const db = await getDb();
    const now = Date.now();
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
          banned: 0,
          ban_reason: null,
          ban_expires: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "user-1",
          name: "Viewer",
          email: "viewer@example.com",
          role: "user",
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
    adminHeaders = await sessionHeadersFor({
      id: "admin-1",
      email: "admin@example.com",
    });
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  function adminRequest(url: string, init?: RequestInit) {
    return new Request(url, {
      ...init,
      headers: {
        cookie: adminHeaders.get("cookie") ?? "",
        ...(init?.headers ?? {}),
      },
    });
  }

  test("loads users for admins", async () => {
    const data = (await load({
      locals: { user: { id: "admin-1", role: "admin" } },
      request: adminRequest("http://localhost/users"),
    } as never)) as UsersLoadResult;
    expect(data.users).toHaveLength(2);
    expect(data.currentUserId).toBe("admin-1");
  });

  test("keeps user management admin-only", async () => {
    await expectRejectsToMatchObject(
      load({
        locals: { user: null },
        request: adminRequest("http://localhost/users"),
      } as never),
      { status: 403 },
    );

    await expectRejectsToMatchObject(
      load({
        locals: { user: { id: "user-1", role: "user" } },
        request: adminRequest("http://localhost/users"),
      } as never),
      { status: 403 },
    );

    const roleForm = new FormData();
    roleForm.set("userId", "user-1");
    roleForm.set("role", "admin");
    const updateResult = await actions.updateRole({
      request: adminRequest("http://localhost/users", { method: "POST", body: roleForm }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(updateResult).toMatchObject({
      status: 403,
      data: { userActionError: "Only admins can manage users." },
    });
  });

  test("creates users and manages roles and deletion", async () => {
    const createForm = new FormData();
    createForm.set("name", "Created");
    createForm.set("email", "created@example.com");
    createForm.set("password", "password123");
    createForm.set("role", "user");
    await expectRedirect(
      actions.create({
        request: adminRequest("http://localhost/users", { method: "POST", body: createForm }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/users",
    );

    const db = await getDb();
    const created = await db
      .selectFrom("user")
      .selectAll()
      .where("email", "=", "created@example.com")
      .executeTakeFirstOrThrow();

    const roleForm = new FormData();
    roleForm.set("userId", created.id);
    roleForm.set("role", "admin");
    await expectRedirect(
      actions.updateRole({
        request: adminRequest("http://localhost/users", { method: "POST", body: roleForm }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/users",
    );

    const deleteForm = new FormData();
    deleteForm.set("userId", created.id);
    await expectRedirect(
      actions.delete({
        request: adminRequest("http://localhost/users", { method: "POST", body: deleteForm }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/users",
    );

    expect(await db.selectFrom("user").selectAll().where("email", "=", "created@example.com").execute()).toEqual([]);
  });
});
