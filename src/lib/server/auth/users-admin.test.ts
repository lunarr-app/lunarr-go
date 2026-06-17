import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { setBooleanSetting } from "$lib/server/settings";
import { resetAuthForTests, sessionHeadersFor } from "$lib/server/auth/test/setup";
import { expectRejectsToThrow } from "$lib/test/async-expect";
import { guardLastAdminOnUserRoleUpdate } from "./admin-safeguards";
import { createManagedUser, deleteManagedUser, listManagedUsers, updateManagedUserRole } from "./users-admin";

describe("users-admin", () => {
  let tempDir: string;
  let adminHeaders: Headers;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-users-admin-"));
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

  test("lists all users with timestamps", async () => {
    const users = await listManagedUsers(adminHeaders);
    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({
      id: "admin-1",
      email: "admin@example.com",
      role: "admin",
      banned: false,
    });
    expect(users[0]?.createdAt).toMatch(/T/);
  });

  test("creates, updates role, and deletes users", async () => {
    const created = await createManagedUser({
      headers: adminHeaders,
      name: "New User",
      email: "new@example.com",
      password: "password123",
      role: "user",
    });
    expect(created.email).toBe("new@example.com");

    const promoted = await updateManagedUserRole({
      headers: adminHeaders,
      userId: created.id,
      role: "admin",
    });
    expect(promoted.role).toBe("admin");

    await deleteManagedUser({
      headers: adminHeaders,
      userId: created.id,
    });

    const users = await listManagedUsers(adminHeaders);
    expect(users.some((user) => user.id === created.id)).toBe(false);
  });

  test("allows role updates without a target user id in the auth hook", async () => {
    expect(await guardLastAdminOnUserRoleUpdate({ role: "user" }, null)).toEqual({ data: { role: "user" } });
  });

  test("blocks demoting the last admin", async () => {
    const db = await getDb();
    await db.deleteFrom("user").where("id", "=", "user-1").execute();

    await expectRejectsToThrow(
      updateManagedUserRole({
        headers: adminHeaders,
        userId: "admin-1",
        role: "user",
      }),
      "At least one admin must remain.",
    );
  });

  test("blocks demoting the last admin via Better Auth setRole", async () => {
    const db = await getDb();
    await db.deleteFrom("user").where("id", "=", "user-1").execute();
    const { auth } = await import("./index");

    await auth.api.setRole({
      body: { userId: "admin-1", role: "user" },
      headers: adminHeaders,
    });

    const row = await db.selectFrom("user").select("role").where("id", "=", "admin-1").executeTakeFirst();
    expect(row?.role).toBe("admin");
  });

  test("creates users even when public signup is closed", async () => {
    await setBooleanSetting("signup_open", false);

    const created = await createManagedUser({
      headers: adminHeaders,
      name: "Invited",
      email: "invited@example.com",
      password: "password123",
      role: "user",
    });

    expect(created.email).toBe("invited@example.com");
  });
});
