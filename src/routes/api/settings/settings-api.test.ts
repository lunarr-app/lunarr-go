import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { GET as settingsGet } from "./+server";
import { PATCH as registrationPatch } from "./registration/+server";
import { PATCH as metadataPatch } from "./metadata/+server";
import { PATCH as transcodingPatch } from "./transcoding/+server";
import { POST as actionsPost } from "./actions/+server";

describe("settings API", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function setupSettings() {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-settings-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    const db = await getDb();
    const nowMs = Date.now();

    await db
      .insertInto("user")
      .values({
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
        email_verified: 0,
        image: null,
        created_at: nowMs,
        updated_at: nowMs,
      })
      .execute();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "User",
        email: "user@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: nowMs,
        updated_at: nowMs,
      })
      .execute();
  }

  function jsonRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  test("GET /api/settings returns settings for admin", async () => {
    await setupSettings();

    const response = await settingsGet({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("signupOpen");
    expect(body).toHaveProperty("tmdbConfigured");
    expect(body).toHaveProperty("transcodePolicy");
  });

  test("GET /api/settings returns 403 for non-admin", async () => {
    await setupSettings();

    const response = await settingsGet({
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(response.status).toBe(403);
  });

  test("GET /api/settings returns 401 without user", async () => {
    await setupSettings();

    const response = await settingsGet({
      locals: {},
    } as never);

    expect(response.status).toBe(401);
  });

  test("PATCH /api/settings/registration updates signup setting", async () => {
    await setupSettings();

    const response = await registrationPatch({
      locals: { user: { id: "admin-1", role: "admin" } },
      request: jsonRequest({ signupOpen: true }),
    } as never);

    expect(response.status).toBe(204);

    const check = await settingsGet({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);
    const body = await check.json();
    expect(body.signupOpen).toBe(true);
  });

  test("PATCH /api/settings/registration returns 403 for non-admin", async () => {
    await setupSettings();

    const response = await registrationPatch({
      locals: { user: { id: "user-1", role: "user" } },
      request: jsonRequest({ signupOpen: true }),
    } as never);

    expect(response.status).toBe(403);
  });

  test("PATCH /api/settings/metadata updates metadata settings", async () => {
    await setupSettings();

    const response = await metadataPatch({
      locals: { user: { id: "admin-1", role: "admin" } },
      request: jsonRequest({ movieMetadataStalenessDays: 90 }),
    } as never);

    expect(response.status).toBe(204);
  });

  test("PATCH /api/settings/metadata returns 403 for non-admin", async () => {
    await setupSettings();

    const response = await metadataPatch({
      locals: { user: { id: "user-1", role: "user" } },
      request: jsonRequest({ movieMetadataStalenessDays: 90 }),
    } as never);

    expect(response.status).toBe(403);
  });

  test("PATCH /api/settings/transcoding updates transcoding settings", async () => {
    await setupSettings();

    const response = await transcodingPatch({
      locals: { user: { id: "admin-1", role: "admin" } },
      request: jsonRequest({ hardwareAcceleration: "auto" }),
    } as never);

    expect(response.status).toBe(204);
  });

  test("PATCH /api/settings/transcoding returns 403 for non-admin", async () => {
    await setupSettings();

    const response = await transcodingPatch({
      locals: { user: { id: "user-1", role: "user" } },
      request: jsonRequest({ hardwareAcceleration: "auto" }),
    } as never);

    expect(response.status).toBe(403);
  });

  test("POST /api/settings/actions returns 403 for non-admin", async () => {
    await setupSettings();

    const response = await actionsPost({
      locals: { user: { id: "user-1", role: "user" } },
      request: new Request("http://localhost/api/settings/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "testTmdb" }),
      }),
    } as never);

    expect(response.status).toBe(403);
  });

  test("POST /api/settings/actions returns 401 without user", async () => {
    await setupSettings();

    const response = await actionsPost({
      locals: {},
      request: new Request("http://localhost/api/settings/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "testTmdb" }),
      }),
    } as never);

    expect(response.status).toBe(401);
  });

  test("POST /api/settings/actions returns 400 for invalid action", async () => {
    await setupSettings();

    const response = await actionsPost({
      locals: { user: { id: "admin-1", role: "admin" } },
      request: new Request("http://localhost/api/settings/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unknownAction" }),
      }),
    } as never);

    expect(response.status).toBe(400);
  });
});
