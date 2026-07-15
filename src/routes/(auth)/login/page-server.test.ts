import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests, type Database } from "$lib/server/db";
import { POST_LOGIN_REDIRECT_QUERY_PARAM } from "$lib/auth/post-login-redirect";
import { setBooleanSetting } from "$lib/server/settings";
import type * as LoginPageServer from "./+page.server";

const signInEmail = mock(async (_input: unknown) => ({}));
let signInEmailSpy: ReturnType<typeof spyOn>;

const loginRoutePromise = import("./+page.server");

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

describe("login page server", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  let load: typeof LoginPageServer.load;
  let actions: typeof LoginPageServer.actions;

  beforeEach(async () => {
    signInEmail.mockClear();
    const authModule = await import("$lib/server/auth");
    signInEmailSpy = spyOn(authModule.auth.api, "signInEmail").mockImplementation(
      signInEmail as unknown as typeof authModule.auth.api.signInEmail,
    );
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-login-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const loginRoute = await loginRoutePromise;
    load = loginRoute.load;
    actions = loginRoute.actions;
  });

  afterEach(async () => {
    signInEmailSpy.mockRestore();
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

  test("reports signup open only during first run or when enabled", async () => {
    expect(await load({ url: new URL("http://localhost/login") } as never)).toEqual({
      signupOpen: true,
      redirectTo: "",
    });

    await insertAdmin();
    expect(await load({ url: new URL("http://localhost/login") } as never)).toEqual({
      signupOpen: false,
      redirectTo: "",
    });

    await setBooleanSetting("signup_open", true);
    expect(
      await load({
        url: new URL(`http://localhost/login?${POST_LOGIN_REDIRECT_QUERY_PARAM}=%2Flink-device%3Fcode%3DABCD-1234`),
      } as never),
    ).toEqual({
      signupOpen: true,
      redirectTo: "/link-device?code=ABCD-1234",
    });
  });

  test("signs in with email and password", async () => {
    const form = new FormData();
    form.set("email", "admin@example.com");
    form.set("password", "password123");

    await expectRedirect(
      actions.signIn({
        request: new Request("http://localhost/login", {
          method: "POST",
          body: form,
        }),
      } as never),
      "/continue",
    );

    expect(signInEmail).toHaveBeenCalledTimes(1);
    expect(signInEmail.mock.calls[0]?.[0]).toMatchObject({
      body: {
        email: "admin@example.com",
        password: "password123",
        rememberMe: true,
      },
    });
  });

  test("redirects to a safe post-login path", async () => {
    const form = new FormData();
    form.set("email", "admin@example.com");
    form.set("password", "password123");
    form.set(POST_LOGIN_REDIRECT_QUERY_PARAM, "/link-device?code=ABCD-1234&name=Living%20room%20TV");

    await expectRedirect(
      actions.signIn({
        request: new Request("http://localhost/login", {
          method: "POST",
          body: form,
        }),
      } as never),
      "/link-device?code=ABCD-1234&name=Living%20room%20TV",
    );
  });
});
