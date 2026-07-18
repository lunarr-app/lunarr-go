import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { GET as librariesGet, POST as librariesPost } from "./+server";
import { GET as libraryGet, PATCH as libraryPatch, DELETE as libraryDelete } from "./[id]/+server";

describe("libraries API", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function setupLibraries() {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-libraries-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    const db = await getDb();
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    await db
      .insertInto("user")
      .values({
        id: "user-1",
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
        id: "user-2",
        name: "User",
        email: "user@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: nowMs,
        updated_at: nowMs,
      })
      .execute();
    await db
      .insertInto("library")
      .values({
        id: "library-1",
        name: "Movies",
        kind: "movie",
        access_mode: "shared",
        path: path.join(tempDir, "movies"),
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("library_user")
      .values({
        library_id: "library-1",
        user_id: "user-1",
        created_at: now,
      })
      .execute();
  }

  test("GET /api/libraries returns libraries for admin", async () => {
    await setupLibraries();

    const response = await librariesGet({
      locals: { user: { id: "user-1", role: "admin" } },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.libraries).toHaveLength(1);
    expect(body.libraries[0].id).toBe("library-1");
  });

  test("GET /api/libraries returns 403 for non-admin", async () => {
    await setupLibraries();

    const response = await librariesGet({
      locals: { user: { id: "user-2", role: "user" } },
    } as never);

    expect(response.status).toBe(403);
  });

  test("GET /api/libraries/[id] returns library detail", async () => {
    await setupLibraries();

    const response = await libraryGet({
      locals: { user: { id: "user-1", role: "admin" } },
      params: { id: "library-1" },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.library).toMatchObject({
      id: "library-1",
      name: "Movies",
    });
  });

  test("GET /api/libraries/[id] returns 404 for non-existent library", async () => {
    await setupLibraries();

    const response = await libraryGet({
      locals: { user: { id: "user-1", role: "admin" } },
      params: { id: "non-existent" },
    } as never);

    expect(response.status).toBe(404);
  });

  test("DELETE /api/libraries/[id] deletes library", async () => {
    await setupLibraries();

    const response = await libraryDelete({
      locals: { user: { id: "user-1", role: "admin" } },
      params: { id: "library-1" },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });

    const checkResponse = await libraryGet({
      locals: { user: { id: "user-1", role: "admin" } },
      params: { id: "library-1" },
    } as never);
    expect(checkResponse.status).toBe(404);
  });

  test("DELETE /api/libraries/[id] returns 403 for non-admin", async () => {
    await setupLibraries();

    const response = await libraryDelete({
      locals: { user: { id: "user-2", role: "user" } },
      params: { id: "library-1" },
    } as never);

    expect(response.status).toBe(403);
  });
});
