import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
  type Database,
} from "$lib/server/db";
import { setBooleanSetting } from "$lib/server/settings";
import type * as SignupPageServer from "./+page.server";

const signUpEmail = mock(async (_input: unknown) => ({}));

mock.module("$lib/server/auth", () => ({
  auth: {
    api: {
      signUpEmail,
    },
  },
}));

const signupRoutePromise = import("./+page.server");

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

describe("signup page server", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  let load: typeof SignupPageServer.load;
  let actions: typeof SignupPageServer.actions;

  beforeEach(async () => {
    signUpEmail.mockClear();
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-signup-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const signupRoute = await signupRoutePromise;
    load = signupRoute.load;
    actions = signupRoute.actions;
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  async function insertAdmin() {
    const now = Date.now();
    await db
      .insertInto("user")
      .values({
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  test("redirects to login when registration is closed", async () => {
    await insertAdmin();
    await expectRedirect(load({} as never), "/login");
  });

  test("rejects closed signup after setup", async () => {
    await insertAdmin();
    const form = new FormData();
    form.set("name", "User");
    form.set("email", "user@example.com");
    form.set("password", "password123");

    const result = await actions.default({
      request: new Request("http://localhost/signup", {
        method: "POST",
        body: form,
      }),
    } as never);

    expect(result).toMatchObject({
      status: 403,
      data: {
        error: "Registration is closed for this server.",
      },
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  test("creates a later account only when signup is enabled", async () => {
    await insertAdmin();
    await setBooleanSetting("signup_open", true);
    const form = new FormData();
    form.set("name", "User");
    form.set("email", "user@example.com");
    form.set("password", "password123");

    expect(await load({} as never)).toBeUndefined();
    await expectRedirect(
      actions.default({
        request: new Request("http://localhost/signup", {
          method: "POST",
          body: form,
        }),
      } as never),
      "/movies",
    );

    expect(signUpEmail).toHaveBeenCalledTimes(1);
    expect(signUpEmail.mock.calls[0]?.[0]).toMatchObject({
      body: {
        name: "User",
        email: "user@example.com",
        password: "password123",
      },
    });
  });
});
