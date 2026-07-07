import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests, type Database } from "$lib/server/db";
import { clearTmdbDetailCachesForTests } from "$lib/server/metadata/tmdb";
import { setSetting } from "$lib/server/settings";
import { actions, load } from "./+page.server";

type MovieDetailLoadResult = {
  movie: {
    id: string;
    title: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    sort_title?: string;
    parent_id?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  files: Array<{
    id: string;
    basename: string;
    path?: string;
    library_id?: string;
    media_item_id?: string;
    created_at?: string;
    updated_at?: string;
  }>;
  progress: Array<{
    media_file_id: string;
    position_seconds: number;
    duration_seconds: number | null;
    completed: boolean | number;
    updated_at: string;
    user_id?: string;
  }>;
  canManageMetadata: boolean;
  tmdbConfigured: boolean;
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

describe("movie detail page server", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    clearTmdbDetailCachesForTests();
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-movie-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Movie User",
        email: "movie@example.com",
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
        path: tempDir,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "movie-1",
          kind: "movie",
          title: "Movie",
          sort_title: "movie",
          year: 2026,
          overview: "A local test movie.",
          runtime_seconds: 7200,
          poster_path: "/poster.jpg",
          backdrop_path: "/backdrop.jpg",
          release_date: "2026-01-01",
          provider: "tmdb",
          provider_id: "123",
          parent_id: null,
          popularity: 10,
          vote_average: 8,
          created_at: now,
          updated_at: now,
        },
        {
          id: "movie-2",
          kind: "movie",
          title: "Other Movie",
          sort_title: "other movie",
          year: 2025,
          overview: null,
          runtime_seconds: null,
          poster_path: null,
          backdrop_path: null,
          release_date: "2025-01-01",
          provider: null,
          provider_id: null,
          parent_id: null,
          popularity: null,
          vote_average: null,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
    await db
      .insertInto("media_file")
      .values([
        {
          id: "file-1",
          library_id: "library-1",
          media_item_id: "movie-1",
          path: path.join(tempDir, "Movie.2026.mp4"),
          basename: "Movie.2026.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
        {
          id: "other-file",
          library_id: "library-1",
          media_item_id: "movie-2",
          path: path.join(tempDir, "Other.Movie.2025.mp4"),
          basename: "Other.Movie.2025.mp4",
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await closeDatabaseForTests?.();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("loads playable movie detail without exposing internal file fields", async () => {
    const result = (await load({
      params: { id: "movie-1" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never)) as MovieDetailLoadResult;

    expect(result.movie).toMatchObject({
      id: "movie-1",
      title: "Movie",
    });
    expect(result.movie.updated_at).toEqual(expect.any(String));
    expect(result.movie.poster_path).toBeUndefined();
    expect(result.movie.backdrop_path).toBeUndefined();
    expect(result.movie.sort_title).toBeUndefined();
    expect(result.movie.parent_id).toBeUndefined();
    expect(result.movie.created_at).toBeUndefined();
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      id: "file-1",
      basename: "Movie.2026.mp4",
    });
    expect(result.files[0].path).toBeUndefined();
    expect(result.files[0].library_id).toBeUndefined();
    expect(result.files[0].media_item_id).toBeUndefined();
    expect(result.files[0].created_at).toBeUndefined();
    expect(result.files[0].updated_at).toBeUndefined();
    expect(result.progress).toEqual([]);
    expect(result.canManageMetadata).toBe(false);
    expect(result.tmdbConfigured).toBe(true);
  });

  test("marks a movie file watched and unwatched through the form action", async () => {
    const watchedForm = new FormData();
    watchedForm.set("fileId", "file-1");
    watchedForm.set("completed", "true");
    await expectRedirect(
      actions.watched({
        params: { id: "movie-1" },
        request: new Request("http://localhost/movies/movie-1", {
          method: "POST",
          body: watchedForm,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/movies/movie-1",
    );

    const watchedProgress = await db.selectFrom("watch_progress").selectAll().executeTakeFirstOrThrow();
    expect(watchedProgress).toMatchObject({
      user_id: "user-1",
      media_item_id: "movie-1",
      media_file_id: "file-1",
      completed: 1,
    });

    const unwatchedForm = new FormData();
    unwatchedForm.set("fileId", "file-1");
    unwatchedForm.set("completed", "false");
    await expectRedirect(
      actions.watched({
        params: { id: "movie-1" },
        request: new Request("http://localhost/movies/movie-1", {
          method: "POST",
          body: unwatchedForm,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/movies/movie-1",
    );

    const unwatchedProgress = await db.selectFrom("watch_progress").selectAll().executeTakeFirstOrThrow();
    expect(unwatchedProgress).toMatchObject({
      media_item_id: "movie-1",
      media_file_id: "file-1",
      position_seconds: 0,
      duration_seconds: null,
      completed: 0,
    });
  });

  test("loads progress needed by the UI without exposing user ids", async () => {
    await db
      .insertInto("watch_progress")
      .values({
        user_id: "user-1",
        media_item_id: "movie-1",
        media_file_id: "file-1",
        position_seconds: 42,
        duration_seconds: 100,
        completed: 0,
        updated_at: "2026-01-01T00:00:00.000Z",
      })
      .execute();

    const result = (await load({
      params: { id: "movie-1" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never)) as MovieDetailLoadResult;

    expect(result.progress).toEqual([
      {
        media_file_id: "file-1",
        position_seconds: 42,
        duration_seconds: 100,
        completed: 0,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(result.progress[0].user_id).toBeUndefined();
  });

  test("rejects watched updates for files outside the selected movie", async () => {
    const form = new FormData();
    form.set("fileId", "other-file");
    form.set("completed", "true");

    const result = await actions.watched({
      params: { id: "movie-1" },
      request: new Request("http://localhost/movies/movie-1", {
        method: "POST",
        body: form,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "Media file does not belong to a playable item.",
      },
    });
    expect(await db.selectFrom("watch_progress").selectAll().execute()).toEqual([]);
  });

  test("keeps detail metadata refresh admin-only and uses bundled fallback credentials", async () => {
    const userResult = await actions.refreshMetadata({
      params: { id: "movie-2" },
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(userResult).toMatchObject({
      status: 403,
      data: {
        metadataError: "Only admins can refresh metadata.",
      },
    });

    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: expect.stringMatching(/^Bearer /),
      });
      const url = String(input);

      if (url.includes("/search/movie")) {
        return Response.json({ results: [] });
      }

      return Response.json({});
    }) as typeof fetch;

    const adminResult = await actions.refreshMetadata({
      params: { id: "movie-2" },
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);
    expect(adminResult).toMatchObject({
      status: 400,
      data: {
        metadataError: "No TMDb match was found for this movie.",
      },
    });
  });

  test("refreshes a single local movie from TMDb through the detail action", async () => {
    await setSetting("tmdb_api_key", "saved-api-key");
    const calls: string[] = [];
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [{ id: 456, title: "Other Movie", release_date: "2025-03-14" }],
        });
      }

      return Response.json({
        id: 456,
        title: "Other Movie",
        overview: "Matched from the detail page.",
        release_date: "2025-03-14",
        runtime: 110,
        poster_path: "/other-poster.jpg",
        backdrop_path: "/other-backdrop.jpg",
        popularity: 12,
        vote_average: 7.2,
        genres: [{ id: 53, name: "Thriller" }],
      });
    }) as typeof fetch;

    await expectRedirect(
      actions.refreshMetadata({
        params: { id: "movie-2" },
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/movies/movie-2",
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("api_key=saved-api-key");
    const movie = await db.selectFrom("media_item").selectAll().where("id", "=", "movie-2").executeTakeFirstOrThrow();
    expect(movie).toMatchObject({
      provider: "tmdb",
      provider_id: "456",
      overview: "Matched from the detail page.",
      runtime_seconds: 6600,
      poster_path: "/other-poster.jpg",
      backdrop_path: "/other-backdrop.jpg",
      release_date: "2025-03-14",
      popularity: 12,
      vote_average: 7.2,
    });
    expect(
      await db.selectFrom("media_item_genre").select(["name"]).where("media_item_id", "=", "movie-2").execute(),
    ).toEqual([{ name: "Thriller" }]);
  });

  test("redirects to the surviving movie when metadata refresh merges duplicates", async () => {
    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values({
        id: "movie-provider",
        kind: "movie",
        title: "Other Movie",
        sort_title: "other movie",
        year: 2025,
        overview: "Existing matched row.",
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2025-03-14",
        provider: "tmdb",
        provider_id: "456",
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await setSetting("tmdb_api_key", "saved-api-key");
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [{ id: 456, title: "Other Movie", release_date: "2025-03-14" }],
        });
      }

      return Response.json({
        id: 456,
        title: "Other Movie",
        overview: "Merged from a local duplicate.",
        release_date: "2025-03-14",
        runtime: 110,
        poster_path: "/other-poster.jpg",
        backdrop_path: "/other-backdrop.jpg",
      });
    }) as typeof fetch;

    await expectRedirect(
      actions.refreshMetadata({
        params: { id: "movie-2" },
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never),
      "/movies/movie-provider",
    );

    expect(
      await db.selectFrom("media_item").select("id").where("id", "=", "movie-2").executeTakeFirst(),
    ).toBeUndefined();
    const movedFile = await db
      .selectFrom("media_file")
      .selectAll()
      .where("id", "=", "other-file")
      .executeTakeFirstOrThrow();
    expect(movedFile.media_item_id).toBe("movie-provider");
  });
});
