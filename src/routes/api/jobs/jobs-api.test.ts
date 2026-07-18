import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { GET as jobsGet } from "./+server";
import { GET as jobErrorsGet } from "./[id]/errors/+server";
import { POST as jobCancelPost } from "./[id]/cancel/+server";

describe("jobs API", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    await closeDatabaseForTests();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function setupJobs() {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-jobs-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    const db = await getDb();
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

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
      .insertInto("scan_job")
      .values({
        id: "job-1",
        library_id: "library-1",
        status: "completed",
        started_at: now,
        finished_at: now,
        files_seen: 10,
        files_added: 5,
        files_updated: 2,
        files_removed: 1,
        errors_count: 0,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("scan_job")
      .values({
        id: "job-2",
        library_id: "library-1",
        status: "queued",
        files_seen: 0,
        files_added: 0,
        files_updated: 0,
        files_removed: 0,
        errors_count: 0,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  test("GET /api/jobs returns jobs for admin", async () => {
    await setupJobs();

    const response = await jobsGet({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary).toMatchObject({
      total: 2,
      completed: 1,
    });
    expect(body.jobs).toHaveLength(2);
  });

  test("GET /api/jobs returns 403 for non-admin", async () => {
    await setupJobs();

    const response = await jobsGet({
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(response.status).toBe(403);
  });

  test("GET /api/jobs returns 401 without user", async () => {
    await setupJobs();

    const response = await jobsGet({
      locals: {},
    } as never);

    expect(response.status).toBe(401);
  });

  test("GET /api/jobs/[id]/errors returns errors for a job", async () => {
    await setupJobs();

    const response = await jobErrorsGet({
      locals: { user: { id: "admin-1", role: "admin" } },
      params: { id: "job-1" },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.errors).toEqual([]);
    expect(body.limit).toBe(100);
  });

  test("GET /api/jobs/[id]/errors returns 403 for non-admin", async () => {
    await setupJobs();

    const response = await jobErrorsGet({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "job-1" },
    } as never);

    expect(response.status).toBe(403);
  });

  test("POST /api/jobs/[id]/cancel cancels a queued job", async () => {
    await setupJobs();

    const response = await jobCancelPost({
      locals: { user: { id: "admin-1", role: "admin" } },
      params: { id: "job-2" },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  test("POST /api/jobs/[id]/cancel returns 404 for non-existent job", async () => {
    await setupJobs();

    const response = await jobCancelPost({
      locals: { user: { id: "admin-1", role: "admin" } },
      params: { id: "non-existent" },
    } as never);

    expect(response.status).toBe(404);
  });

  test("POST /api/jobs/[id]/cancel returns error for inactive job", async () => {
    await setupJobs();

    const response = await jobCancelPost({
      locals: { user: { id: "admin-1", role: "admin" } },
      params: { id: "job-1" },
    } as never);

    expect(response.status).toBe(400);
  });

  test("POST /api/jobs/[id]/cancel returns 403 for non-admin", async () => {
    await setupJobs();

    const response = await jobCancelPost({
      locals: { user: { id: "user-1", role: "user" } },
      params: { id: "job-2" },
    } as never);

    expect(response.status).toBe(403);
  });
});
