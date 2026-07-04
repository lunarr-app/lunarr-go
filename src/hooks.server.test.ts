import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Handle } from "@sveltejs/kit";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import type { Database } from "$lib/server/db/schema";
import { expectRejectsToMatchObject } from "$lib/test/async-expect";
import { createApiKeyForUser, resetAuthForTests } from "$lib/server/auth/test/setup";

type TestEvent = {
  request: Request;
  url: URL;
  locals: Record<string, unknown>;
};

describe("server hook route boundaries", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  let handle: Handle;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-hooks-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    await resetAuthForTests();
    db = await getDb();

    handle = (await import("./hooks.server")).handle;
  });

  afterAll(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  function eventFor(pathname: string, init?: RequestInit): TestEvent {
    const url = new URL(pathname, "http://localhost");
    return {
      request: new Request(url, init),
      url,
      locals: {},
    };
  }

  test("redirects first-run app requests to setup", async () => {
    await expectRejectsToMatchObject(
      handle({
        event: eventFor("/movies") as never,
        resolve: async () => new Response("resolved"),
      }),
      {
        status: 303,
        location: "/setup",
      },
    );
  });

  test("redirects first-run login requests to setup", async () => {
    await expectRejectsToMatchObject(
      handle({
        event: eventFor("/login") as never,
        resolve: async () => new Response("resolved"),
      }),
      {
        status: 303,
        location: "/setup",
      },
    );
  });

  test("returns JSON 401 for protected API requests before setup exists", async () => {
    const response = await handle({
      event: eventFor("/api/jobs") as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("returns JSON 401 for media stream requests before setup exists", async () => {
    const response = await handle({
      event: eventFor("/media/files/file-1/stream") as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("does not treat auth-prefixed sibling API paths as public before setup", async () => {
    const response = await handle({
      event: eventFor("/api/authz") as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("lets OpenAPI docs resolve before setup", async () => {
    const response = await handle({
      event: eventFor("/api/openapi.json") as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("resolved");
  });

  test("lets health checks resolve before setup", async () => {
    const response = await handle({
      event: eventFor("/api/health") as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("resolved");
  });

  test("redirects protected app pages to login after setup exists", async () => {
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

    await expectRejectsToMatchObject(
      handle({
        event: eventFor("/movies") as never,
        resolve: async () => new Response("resolved"),
      }),
      {
        status: 303,
        location: "/login",
      },
    );
  });

  test("returns JSON 401 for protected API requests without a session", async () => {
    const response = await handle({
      event: eventFor("/api/jobs") as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("returns JSON 401 for media subtitle requests without a session", async () => {
    const response = await handle({
      event: eventFor("/media/subtitles/subtitle-1") as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("returns JSON 401 for HLS playback-session requests without a session", async () => {
    const response = await handle({
      event: eventFor("/media/playback-sessions/session-1/master.m3u8") as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("lets signed-token media requests reach route handlers without a session", async () => {
    const response = await handle({
      event: eventFor("/media/files/file-1/stream?remoteToken=test") as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("resolved");
  });

  test("lets media OPTIONS preflights reach route handlers without a session", async () => {
    const response = await handle({
      event: eventFor("/media/files/file-1/stream", {
        method: "OPTIONS",
      }) as never,
      resolve: async () => new Response(null, { status: 204 }),
    });

    expect(response.status).toBe(204);
  });

  test("does not treat auth-prefixed sibling API paths as public after setup", async () => {
    const response = await handle({
      event: eventFor("/api/authz") as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("lets OpenAPI docs resolve without a session", async () => {
    const response = await handle({
      event: eventFor("/api/openapi.yaml") as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("resolved");
  });

  test("accepts an API key header for protected API requests", async () => {
    const { token } = await createApiKeyForUser({
      userId: "admin-1",
      name: "Mobile",
    });
    const event = eventFor("/api/jobs", {
      headers: {
        "x-api-key": token,
      },
    });

    const response = await handle({
      event: event as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("resolved");
    expect(event.locals.user).toMatchObject({
      id: "admin-1",
      role: "admin",
    });

    const key = await db
      .selectFrom("apikey")
      .select(["last_request"])
      .where("reference_id", "=", "admin-1")
      .executeTakeFirstOrThrow();
    expect(key.last_request).toBeTruthy();
    expect(Number.isNaN(Date.parse(String(key.last_request)))).toBe(false);
  });

  test("keeps expiring api keys after repeated session lookup", async () => {
    const before = Date.now();
    const { token, apiKey } = await createApiKeyForUser({
      userId: "admin-1",
      name: "Expiring mobile",
      expiresIn: 7200,
    });

    const row = await db
      .selectFrom("apikey")
      .select(["expires_at"])
      .where("id", "=", apiKey.id)
      .executeTakeFirstOrThrow();
    const expiresAt = Date.parse(String(row.expires_at));
    expect(Number.isFinite(expiresAt)).toBe(true);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 7200 * 1000);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await handle({
        event: eventFor("/api/jobs", {
          headers: {
            "x-api-key": token,
          },
        }) as never,
        resolve: async () => new Response("resolved"),
      });
      expect(response.status).toBe(200);
    }

    expect(await db.selectFrom("apikey").select(["id"]).where("id", "=", apiKey.id).executeTakeFirst()).toBeTruthy();
  });

  test("rejects an invalid API key for protected media resources", async () => {
    const response = await handle({
      event: eventFor("/media/files/file-1/stream", {
        headers: {
          "x-api-key": "lunarr_invalid",
        },
      }) as never,
      resolve: async () => new Response("resolved"),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
