import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests, type Database } from "../db";
import { setBooleanSetting } from "../settings";
import { hasRegisteredUsers, isAdmin, requireAdmin, roleForNewUser, signupAllowed } from "./users";

let tempDir: string;
let db: Kysely<Database>;

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-auth-users-"));
  await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
  await migrateDatabase();
  db = await getDb();
});

afterAll(async () => {
  await closeDatabaseForTests();
  await rm(tempDir, { recursive: true, force: true });
});

describe("signup policy", () => {
  test("allows first-run signup and closes later signup by default", async () => {
    expect(await hasRegisteredUsers()).toBe(false);
    expect(await signupAllowed()).toBe(true);
    expect(await roleForNewUser()).toBe("admin");

    const now = Date.now();
    await db
      .insertInto("user")
      .values({
        id: "admin-user",
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now
      })
      .execute();

    expect(await hasRegisteredUsers()).toBe(true);
    expect(await signupAllowed()).toBe(false);
    expect(await roleForNewUser()).toBe("user");

    await setBooleanSetting("signup_open", true);
    expect(await signupAllowed()).toBe(true);

    await setBooleanSetting("signup_open", false);
    expect(await signupAllowed()).toBe(false);
  });
});

describe("admin policy", () => {
  test("identifies admins and rejects non-admin users", () => {
    expect(isAdmin({ role: "admin" })).toBe(true);
    expect(isAdmin({ role: "user" })).toBe(false);
    expect(isAdmin(null)).toBe(false);

    expect(() => requireAdmin({ role: "admin" })).not.toThrow();
    for (const user of [{ role: "user" }, null]) {
      try {
        requireAdmin(user);
        throw new Error("Expected requireAdmin to throw.");
      } catch (error) {
        expect(error).toMatchObject({
          status: 403,
          body: { message: "Admin access required" }
        });
      }
    }
  });
});
