import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests, type Database } from "$lib/server/db";
import type * as SetupPageServer from "./+page.server";

const signUpEmail = mock(async (_input: unknown) => ({}));
let signUpEmailSpy: ReturnType<typeof spyOn>;

const setupRoutePromise = import("./+page.server");

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

describe("setup page server", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  let load: typeof SetupPageServer.load;
  let actions: typeof SetupPageServer.actions;

  beforeEach(async () => {
    signUpEmail.mockClear();
    const authModule = await import("$lib/server/auth");
    signUpEmailSpy = spyOn(authModule.auth.api, "signUpEmail").mockImplementation(
      signUpEmail as unknown as typeof authModule.auth.api.signUpEmail,
    );
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-setup-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const setupRoute = await setupRoutePromise;
    load = setupRoute.load;
    actions = setupRoute.actions;
  });

  afterEach(async () => {
    signUpEmailSpy.mockRestore();
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("allows setup before any users exist", async () => {
    expect(await load({} as never)).toBeUndefined();
  });

  test("redirects setup once a user exists", async () => {
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

    await expectRedirect(load({} as never), "/login");
  });

  test("validates required first admin fields", async () => {
    const form = new FormData();
    form.set("name", "Admin");

    const result = await actions.default({
      request: new Request("http://localhost/setup", {
        method: "POST",
        body: form,
      }),
    } as never);

    expect(result).toMatchObject({
      status: 400,
      data: {
        name: "Admin",
        email: "",
        error: "Name, email, and password are required.",
      },
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  test("creates the first admin account through auth signup", async () => {
    const form = new FormData();
    form.set("name", "Admin");
    form.set("email", "admin@example.com");
    form.set("password", "password123");

    await expectRedirect(
      actions.default({
        request: new Request("http://localhost/setup", {
          method: "POST",
          body: form,
          headers: { "user-agent": "setup-test" },
        }),
      } as never),
      "/continue",
    );

    expect(signUpEmail).toHaveBeenCalledTimes(1);
    expect(signUpEmail.mock.calls[0]?.[0]).toMatchObject({
      body: {
        name: "Admin",
        email: "admin@example.com",
        password: "password123",
      },
    });
  });

  test("rejects setup submission after setup is complete", async () => {
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

    const result = await actions.default({
      request: new Request("http://localhost/setup", {
        method: "POST",
        body: new FormData(),
      }),
    } as never);

    expect(result).toMatchObject({
      status: 403,
      data: {
        error: "Setup is already complete.",
      },
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });
});
