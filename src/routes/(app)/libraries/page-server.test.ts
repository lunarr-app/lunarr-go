import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
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
import type { ScanJobStatus } from "$lib/server/db/schema";
import { actions, load } from "./+page.server";

type LibrariesLoadResult = {
  tmdbConfigured: boolean;
  libraries: Array<{
    id: string;
    name: string;
    path: string;
    kind: string;
    scanActive: boolean;
    latestScanJob: {
      status: ScanJobStatus;
    } | null;
  }>;
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

describe("libraries page server", () => {
  let tempDir: string;
  let libraryDir: string;
  let resolvedLibraryDir: string;
  let db: Kysely<Database>;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-libraries-page-"));
    libraryDir = path.join(tempDir, "Movies");
    await writeFile(path.join(tempDir, ".keep"), "");
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();
    await mkdir(libraryDir);
    resolvedLibraryDir = await realpath(libraryDir);
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("adds a movie library through the admin form action", async () => {
    const form = new FormData();
    form.set("name", "Movies");
    form.set("path", libraryDir);

    await expectRedirect(
      actions.add({
        request: new Request("http://localhost/libraries", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/libraries",
    );

    const libraries = await db.selectFrom("library").selectAll().execute();
    expect(libraries).toHaveLength(1);
    expect(libraries[0]).toMatchObject({
      name: "Movies",
      kind: "movie",
      path: resolvedLibraryDir,
    });

    const data = (await load({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never)) as LibrariesLoadResult;
    expect(data.tmdbConfigured).toBe(true);
    expect(data.libraries).toHaveLength(1);
    expect(data.libraries[0]).toMatchObject({
      name: "Movies",
      path: resolvedLibraryDir,
      kind: "movie",
      scanActive: false,
      latestScanJob: null,
    });
  });

  test("keeps library creation admin-only", async () => {
    const form = new FormData();
    form.set("name", "Movies");
    form.set("path", libraryDir);

    const result = await actions.add({
      request: new Request("http://localhost/libraries", {
        method: "POST",
        body: form,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(result).toMatchObject({
      status: 403,
      data: {
        name: "Movies",
        path: libraryDir,
        addError: "Only admins can add libraries.",
      },
    });
    expect(await db.selectFrom("library").selectAll().execute()).toEqual([]);
  });

  test("starts a manual scan for a configured library", async () => {
    await writeFile(path.join(libraryDir, "Example.Movie.2026.mp4"), "video");
    globalThis.fetch = (async (
      input: URL | RequestInfo,
      init?: RequestInit,
    ) => {
      expect(init?.headers).toMatchObject({
        authorization: expect.stringMatching(/^Bearer /),
      });
      const url = String(input);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            { id: 100, title: "Example Movie", release_date: "2026-01-01" },
          ],
        });
      }

      return Response.json({
        id: 100,
        title: "Example Movie",
        release_date: "2026-01-01",
        poster_path: "/example.jpg",
      });
    }) as typeof fetch;

    const addForm = new FormData();
    addForm.set("name", "Movies");
    addForm.set("path", libraryDir);
    await expectRedirect(
      actions.add({
        request: new Request("http://localhost/libraries", {
          method: "POST",
          body: addForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/libraries",
    );
    const library = await db
      .selectFrom("library")
      .selectAll()
      .executeTakeFirstOrThrow();

    const scanForm = new FormData();
    scanForm.set("libraryId", library.id);
    await expectRedirect(
      actions.scan({
        request: new Request("http://localhost/libraries", {
          method: "POST",
          body: scanForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/jobs",
    );

    let job = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("library_id", "=", library.id)
      .executeTakeFirstOrThrow();
    for (
      let index = 0;
      index < 20 && (job.status === "queued" || job.status === "running");
      index += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      job = await db
        .selectFrom("scan_job")
        .selectAll()
        .where("id", "=", job.id)
        .executeTakeFirstOrThrow();
    }

    expect(job).toMatchObject({
      library_id: library.id,
      status: "completed",
      files_seen: 1,
      files_added: 1,
      errors_count: 0,
    });
    expect(
      await db.selectFrom("media_file").selectAll().execute(),
    ).toHaveLength(1);
  });

  test("removes a configured library through the admin form action", async () => {
    const addForm = new FormData();
    addForm.set("name", "Movies");
    addForm.set("path", libraryDir);
    await expectRedirect(
      actions.add({
        request: new Request("http://localhost/libraries", {
          method: "POST",
          body: addForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/libraries",
    );
    const library = await db
      .selectFrom("library")
      .selectAll()
      .executeTakeFirstOrThrow();

    const deleteForm = new FormData();
    deleteForm.set("libraryId", library.id);
    await expectRedirect(
      actions.delete({
        request: new Request("http://localhost/libraries", {
          method: "POST",
          body: deleteForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/libraries",
    );

    expect(await db.selectFrom("library").selectAll().execute()).toEqual([]);
  });

  test("updates a configured library through the admin form action", async () => {
    const nextDir = path.join(tempDir, "Next Movies");
    await mkdir(nextDir);
    const resolvedNextDir = await realpath(nextDir);
    const addForm = new FormData();
    addForm.set("name", "Movies");
    addForm.set("path", libraryDir);
    await expectRedirect(
      actions.add({
        request: new Request("http://localhost/libraries", {
          method: "POST",
          body: addForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/libraries",
    );
    const library = await db
      .selectFrom("library")
      .selectAll()
      .executeTakeFirstOrThrow();

    const editForm = new FormData();
    editForm.set("libraryId", library.id);
    editForm.set("source", "local");
    editForm.set("name", "Next");
    editForm.set("path", nextDir);
    await expectRedirect(
      actions.edit({
        request: new Request("http://localhost/libraries", {
          method: "POST",
          body: editForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/libraries",
    );

    const updated = await db
      .selectFrom("library")
      .selectAll()
      .where("id", "=", library.id)
      .executeTakeFirstOrThrow();
    expect(updated).toMatchObject({
      name: "Next",
      path: resolvedNextDir,
    });
  });

  test("updates selected user access for a library", async () => {
    const nowMs = Date.now();
    await db
      .insertInto("user")
      .values([
        {
          id: "user-1",
          name: "Viewer One",
          email: "viewer1@example.com",
          role: "user",
          email_verified: 0,
          image: null,
          created_at: nowMs,
          updated_at: nowMs,
        },
        {
          id: "user-2",
          name: "Viewer Two",
          email: "viewer2@example.com",
          role: "user",
          email_verified: 0,
          image: null,
          created_at: nowMs,
          updated_at: nowMs,
        },
      ])
      .execute();
    const addForm = new FormData();
    addForm.set("name", "Movies");
    addForm.set("path", libraryDir);
    await expectRedirect(
      actions.add({
        request: new Request("http://localhost/libraries", {
          method: "POST",
          body: addForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/libraries",
    );
    const library = await db
      .selectFrom("library")
      .selectAll()
      .executeTakeFirstOrThrow();

    const accessForm = new FormData();
    accessForm.set("libraryId", library.id);
    accessForm.set("accessMode", "shared");
    accessForm.append("userIds", "user-2");
    await expectRedirect(
      actions.access({
        request: new Request("http://localhost/libraries", {
          method: "POST",
          body: accessForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/libraries",
    );

    expect(
      await db
        .selectFrom("library")
        .select("access_mode")
        .where("id", "=", library.id)
        .executeTakeFirst(),
    ).toEqual({
      access_mode: "shared",
    });
    expect(
      await db
        .selectFrom("library_user")
        .select(["library_id", "user_id"])
        .execute(),
    ).toEqual([{ library_id: library.id, user_id: "user-2" }]);
  });

  test("keeps scan, edit, and delete actions admin-only", async () => {
    const addForm = new FormData();
    addForm.set("name", "Movies");
    addForm.set("path", libraryDir);
    await expectRedirect(
      actions.add({
        request: new Request("http://localhost/libraries", {
          method: "POST",
          body: addForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/libraries",
    );
    const library = await db
      .selectFrom("library")
      .selectAll()
      .executeTakeFirstOrThrow();

    const scanForm = new FormData();
    scanForm.set("libraryId", library.id);
    const scanResult = await actions.scan({
      request: new Request("http://localhost/libraries", {
        method: "POST",
        body: scanForm,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(scanResult).toMatchObject({
      status: 403,
      data: {
        libraryActionError: "Only admins can scan libraries.",
      },
    });

    const editForm = new FormData();
    editForm.set("libraryId", library.id);
    editForm.set("source", "local");
    editForm.set("name", "User Edit");
    editForm.set("path", libraryDir);
    const editResult = await actions.edit({
      request: new Request("http://localhost/libraries", {
        method: "POST",
        body: editForm,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(editResult).toMatchObject({
      status: 403,
      data: {
        libraryActionError: "Only admins can edit libraries.",
      },
    });

    const deleteForm = new FormData();
    deleteForm.set("libraryId", library.id);
    const deleteResult = await actions.delete({
      request: new Request("http://localhost/libraries", {
        method: "POST",
        body: deleteForm,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(deleteResult).toMatchObject({
      status: 403,
      data: {
        libraryActionError: "Only admins can remove libraries.",
      },
    });

    expect(await db.selectFrom("library").selectAll().execute()).toHaveLength(
      1,
    );
    expect(await db.selectFrom("scan_job").selectAll().execute()).toEqual([]);
  });
});
