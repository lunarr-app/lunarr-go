import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import type { Database } from "$lib/server/db/schema";
import { clearTmdbDetailCachesForTests } from "$lib/server/metadata/tmdb";
import { DELETE as movieMatchDelete, POST as movieMatchPost } from "./movies/[id]/match/+server";
import { GET as movieMatchSearchGet } from "./movies/[id]/match/search/+server";
import { DELETE as showMatchDelete, POST as showMatchPost } from "./shows/[id]/match/+server";
import { GET as showMatchSearchGet } from "./shows/[id]/match/search/+server";

let tempDir: string;
let db: Kysely<Database>;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

function postRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminLocals() {
  return { user: { id: "admin-1", role: "admin" } };
}

function searchEvent(kind: "movies" | "shows", id: string, query: string, locals: unknown) {
  const url = new URL(`http://localhost/api/${kind}/${id}/match/search?query=${encodeURIComponent(query)}`);
  return { params: { id }, url, locals } as never;
}

function matchDeleteEvent(id: string, locals: unknown) {
  return { params: { id }, locals } as never;
}

beforeEach(async () => {
  clearTmdbDetailCachesForTests();
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-match-api-"));
  await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
  await migrateDatabase();
  db = await getDb();

  const now = new Date().toISOString();
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
    .values({
      id: "movie-1",
      kind: "movie",
      title: "Local Title",
      sort_title: "local title",
      year: 1999,
      overview: null,
      runtime_seconds: null,
      poster_path: null,
      backdrop_path: null,
      release_date: "1999-01-01",
      provider: null,
      provider_id: null,
      manual_match: 0,
      parent_id: null,
      popularity: null,
      vote_average: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  await db
    .insertInto("media_file")
    .values({
      id: "file-1",
      library_id: "library-1",
      media_item_id: "movie-1",
      path: path.join(tempDir, "The.Matrix.1999.mkv"),
      basename: "The.Matrix.1999.mkv",
      extension: ".mkv",
      size_bytes: 10,
      mtime_ms: Date.now(),
      duration_seconds: null,
      video_codec: null,
      audio_codec: null,
      container: "mkv",
      created_at: now,
      updated_at: now,
    })
    .execute();
  await db
    .insertInto("media_item")
    .values([
      {
        id: "show-1",
        kind: "show",
        title: "Local Show",
        sort_title: "local show",
        year: null,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: null,
        provider: null,
        provider_id: null,
        manual_match: 0,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: "season-1",
        kind: "season",
        title: "Season 1",
        sort_title: "0001",
        year: null,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: null,
        season_number: 1,
        episode_number: null,
        provider: null,
        provider_id: null,
        manual_match: 0,
        parent_id: "show-1",
        popularity: null,
        vote_average: null,
        created_at: now,
        updated_at: now,
      },
    ])
    .execute();
});

afterEach(async () => {
  fetchSpy?.mockRestore();
  await closeDatabaseForTests();
  await rm(tempDir, { recursive: true, force: true });
});

function stubTmdbFetch(handler: (url: string) => Response | Promise<Response>) {
  const mockedFetch = async (input: URL | RequestInfo) => handler(String(input));
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(mockedFetch as typeof fetch);
}

describe("match API auth boundaries", () => {
  test("requires authentication and admin role for movie match endpoints", async () => {
    const unauthenticatedPost = await movieMatchPost({
      params: { id: "movie-1" },
      request: postRequest("http://localhost/api/movies/movie-1/match", { tmdbId: 603 }),
      locals: { user: null },
    } as never);
    expect(unauthenticatedPost.status).toBe(401);
    expect(await unauthenticatedPost.json()).toMatchObject({ detail: "Unauthorized" });

    const unauthenticatedGet = await movieMatchSearchGet(searchEvent("movies", "movie-1", "matrix", { user: null }));
    expect(unauthenticatedGet.status).toBe(401);

    const forbiddenPost = await movieMatchPost({
      params: { id: "movie-1" },
      request: postRequest("http://localhost/api/movies/movie-1/match", { tmdbId: 603 }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(forbiddenPost.status).toBe(403);
    expect(await forbiddenPost.json()).toMatchObject({ detail: "Admin access required" });

    const forbiddenGet = await movieMatchSearchGet(
      searchEvent("movies", "movie-1", "matrix", { user: { id: "user-1", role: "user" } }),
    );
    expect(forbiddenGet.status).toBe(403);
    expect(await forbiddenGet.json()).toMatchObject({ detail: "Admin access required" });

    const unauthenticatedDelete = await movieMatchDelete(matchDeleteEvent("movie-1", { user: null }));
    expect(unauthenticatedDelete.status).toBe(401);

    const forbiddenDelete = await movieMatchDelete(
      matchDeleteEvent("movie-1", { user: { id: "user-1", role: "user" } }),
    );
    expect(forbiddenDelete.status).toBe(403);
    expect(await forbiddenDelete.json()).toMatchObject({ detail: "Admin access required" });
  });

  test("requires authentication and admin role for show match endpoints", async () => {
    const unauthenticatedPost = await showMatchPost({
      params: { id: "show-1" },
      request: postRequest("http://localhost/api/shows/show-1/match", { tmdbId: 1396 }),
      locals: { user: null },
    } as never);
    expect(unauthenticatedPost.status).toBe(401);

    const unauthenticatedGet = await showMatchSearchGet(searchEvent("shows", "show-1", "breaking", { user: null }));
    expect(unauthenticatedGet.status).toBe(401);

    const forbiddenPost = await showMatchPost({
      params: { id: "show-1" },
      request: postRequest("http://localhost/api/shows/show-1/match", { tmdbId: 1396 }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(forbiddenPost.status).toBe(403);
    expect(await forbiddenPost.json()).toMatchObject({ detail: "Admin access required" });

    const forbiddenGet = await showMatchSearchGet(
      searchEvent("shows", "show-1", "breaking", { user: { id: "user-1", role: "user" } }),
    );
    expect(forbiddenGet.status).toBe(403);
    expect(await forbiddenGet.json()).toMatchObject({ detail: "Admin access required" });

    const unauthenticatedDelete = await showMatchDelete(matchDeleteEvent("show-1", { user: null }));
    expect(unauthenticatedDelete.status).toBe(401);

    const forbiddenDelete = await showMatchDelete(matchDeleteEvent("show-1", { user: { id: "user-1", role: "user" } }));
    expect(forbiddenDelete.status).toBe(403);
    expect(await forbiddenDelete.json()).toMatchObject({ detail: "Admin access required" });
  });
});

describe("movie match search API", () => {
  test("rejects empty queries, unknown movies, and show references", async () => {
    const empty = await movieMatchSearchGet(searchEvent("movies", "movie-1", "   ", adminLocals()));
    expect(empty.status).toBe(400);

    const missing = await movieMatchSearchGet({
      params: { id: "movie-1" },
      url: new URL("http://localhost/api/movies/movie-1/match/search"),
      locals: adminLocals(),
    } as never);
    expect(missing.status).toBe(400);

    const unknownMovie = await movieMatchSearchGet(searchEvent("movies", "unknown", "matrix", adminLocals()));
    expect(unknownMovie.status).toBe(404);
    expect(await unknownMovie.json()).toMatchObject({ detail: "Movie not found." });

    const wrongKind = await movieMatchSearchGet(
      searchEvent("movies", "movie-1", "https://www.themoviedb.org/tv/1396-breaking-bad", adminLocals()),
    );
    expect(wrongKind.status).toBe(400);
    expect(await wrongKind.json()).toMatchObject({ detail: expect.stringContaining("show reference") });
  });

  test("resolves a pasted TMDb movie URL into a single candidate", async () => {
    stubTmdbFetch(async (url) => {
      if (url.includes("/movie/603")) {
        return Response.json({
          id: 603,
          title: "The Matrix",
          overview: "A hacker discovers the nature of reality.",
          release_date: "1999-03-31",
          poster_path: "/matrix.jpg",
        });
      }
      return new Response("{}", { status: 404 });
    });

    const response = await movieMatchSearchGet(
      searchEvent("movies", "movie-1", "https://www.themoviedb.org/movie/603-the-matrix", adminLocals()),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      candidates: [
        {
          providerId: "603",
          title: "The Matrix",
          year: 1999,
          overview: "A hacker discovers the nature of reality.",
          posterPath: "/matrix.jpg",
        },
      ],
      resolved: true,
    });
  });

  test("returns 404 when the referenced TMDb movie does not exist", async () => {
    stubTmdbFetch(async () => new Response("{}", { status: 404 }));

    const response = await movieMatchSearchGet(searchEvent("movies", "movie-1", "999999999", adminLocals()));

    expect(response.status).toBe(404);
  });

  test("searches TMDb by name and returns candidate lists", async () => {
    stubTmdbFetch(async (url) => {
      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            { id: 603, title: "The Matrix", release_date: "1999-03-31", poster_path: "/matrix.jpg" },
            { id: 604, title: "The Matrix Reloaded", release_date: "2003-05-15", poster_path: null },
          ],
        });
      }
      return new Response("{}", { status: 404 });
    });

    const response = await movieMatchSearchGet(searchEvent("movies", "movie-1", "matrix", adminLocals()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resolved).toBe(false);
    expect(body.candidates.map((candidate: { providerId: string }) => candidate.providerId)).toEqual(["603", "604"]);
  });
});

describe("movie match API", () => {
  test("applies a manual match and returns the final media item id", async () => {
    stubTmdbFetch(async (url) => {
      if (url.includes("/movie/603")) {
        return Response.json({
          id: 603,
          title: "The Matrix",
          overview: "A hacker discovers the nature of reality.",
          release_date: "1999-03-31",
          runtime: 136,
          poster_path: "/matrix.jpg",
        });
      }
      return new Response("{}", { status: 404 });
    });

    const response = await movieMatchPost({
      params: { id: "movie-1" },
      request: postRequest("http://localhost/api/movies/movie-1/match", { tmdbId: 603 }),
      locals: adminLocals(),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaItemId: "movie-1" });
  });

  test("rejects invalid bodies and reports missing movies and TMDb IDs", async () => {
    const invalid = await movieMatchPost({
      params: { id: "movie-1" },
      request: postRequest("http://localhost/api/movies/movie-1/match", { tmdbId: "603" }),
      locals: adminLocals(),
    } as never);
    expect(invalid.status).toBe(400);

    const missing = await movieMatchPost({
      params: { id: "unknown" },
      request: postRequest("http://localhost/api/movies/unknown/match", { tmdbId: 603 }),
      locals: adminLocals(),
    } as never);
    expect(missing.status).toBe(404);

    stubTmdbFetch(async () => new Response("{}", { status: 404 }));
    const notFound = await movieMatchPost({
      params: { id: "movie-1" },
      request: postRequest("http://localhost/api/movies/movie-1/match", { tmdbId: 999999999 }),
      locals: adminLocals(),
    } as never);
    expect(notFound.status).toBe(404);
  });
});

describe("show match API", () => {
  test("rejects movie references and unknown shows", async () => {
    const unknownShow = await showMatchSearchGet(searchEvent("shows", "unknown", "breaking bad", adminLocals()));
    expect(unknownShow.status).toBe(404);
    expect(await unknownShow.json()).toMatchObject({ detail: "Show not found." });

    const wrongKind = await showMatchSearchGet(
      searchEvent("shows", "show-1", "https://www.themoviedb.org/movie/603-the-matrix", adminLocals()),
    );
    expect(wrongKind.status).toBe(400);
    expect(await wrongKind.json()).toMatchObject({ detail: expect.stringContaining("movie reference") });
  });

  test("applies a manual match across seasons and returns the final media item id", async () => {
    stubTmdbFetch(async (url) => {
      if (url.includes("/tv/1396/season/1")) {
        return Response.json({
          id: 3572,
          name: "Season 1",
          season_number: 1,
          air_date: "2008-01-20",
          episodes: [
            { id: 62085, name: "Pilot", season_number: 1, episode_number: 1, air_date: "2008-01-20", runtime: 58 },
          ],
        });
      }
      if (url.includes("/tv/1396")) {
        return Response.json({
          id: 1396,
          name: "Breaking Bad",
          original_name: "Breaking Bad",
          overview: "A chemistry teacher turns meth maker.",
          first_air_date: "2008-01-20",
          poster_path: "/bb.jpg",
        });
      }
      return new Response("{}", { status: 404 });
    });

    const response = await showMatchPost({
      params: { id: "show-1" },
      request: postRequest("http://localhost/api/shows/show-1/match", { tmdbId: 1396 }),
      locals: adminLocals(),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaItemId: "show-1" });
  });

  test("reports shows without seasons", async () => {
    await db.deleteFrom("media_item").where("id", "=", "season-1").execute();

    stubTmdbFetch(async () => Response.json({ id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20" }));

    const response = await showMatchPost({
      params: { id: "show-1" },
      request: postRequest("http://localhost/api/shows/show-1/match", { tmdbId: 1396 }),
      locals: adminLocals(),
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ detail: "This show has no seasons to match." });
  });

  test("rejects when the selected TMDb show is missing a local season", async () => {
    await db
      .insertInto("media_item")
      .values({
        id: "season-2",
        kind: "season",
        title: "Season 2",
        sort_title: "0002",
        year: null,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: null,
        season_number: 2,
        episode_number: null,
        provider: null,
        provider_id: null,
        parent_id: "show-1",
        popularity: null,
        vote_average: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    stubTmdbFetch(async (url) => {
      if (url.includes("/tv/1396/season/1")) {
        return Response.json({ id: 3572, name: "Season 1", season_number: 1, episodes: [] });
      }
      if (url.includes("/tv/1396/season/")) return new Response("{}", { status: 404 });
      if (url.includes("/tv/1396")) {
        return Response.json({ id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20" });
      }
      return new Response("{}", { status: 404 });
    });

    const response = await showMatchPost({
      params: { id: "show-1" },
      request: postRequest("http://localhost/api/shows/show-1/match", { tmdbId: 1396 }),
      locals: adminLocals(),
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ detail: "The selected TMDb show has no season 2." });
  });
});

describe("match revert API", () => {
  test("rejects unknown movies and movies that are not manually matched", async () => {
    const unknown = await movieMatchDelete(matchDeleteEvent("unknown", adminLocals()));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ detail: "Movie not found." });

    const notManual = await movieMatchDelete(matchDeleteEvent("movie-1", adminLocals()));
    expect(notManual.status).toBe(400);
    expect(await notManual.json()).toMatchObject({ detail: "This movie is not manually matched." });
  });

  test("reverts a manual movie match and re-matches automatically", async () => {
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "603", manual_match: 1, title: "Wrong Title" })
      .where("id", "=", "movie-1")
      .execute();

    stubTmdbFetch(async (url) => {
      if (url.includes("/search/movie")) {
        return Response.json({ results: [{ id: 603, title: "The Matrix", release_date: "1999-03-31" }] });
      }
      if (url.includes("/movie/603")) {
        return Response.json({ id: 603, title: "The Matrix", release_date: "1999-03-31", runtime: 136 });
      }
      return new Response("{}", { status: 404 });
    });

    const response = await movieMatchDelete(matchDeleteEvent("movie-1", adminLocals()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaItemId: "movie-1" });
  });

  test("rejects unknown shows and shows that are not manually matched", async () => {
    const unknown = await showMatchDelete(matchDeleteEvent("unknown", adminLocals()));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ detail: "Show not found." });

    const notManual = await showMatchDelete(matchDeleteEvent("show-1", adminLocals()));
    expect(notManual.status).toBe(400);
    expect(await notManual.json()).toMatchObject({ detail: "This show is not manually matched." });
  });

  test("reverts a manual show match and re-matches automatically", async () => {
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "1396", manual_match: 1, title: "Wrong Show" })
      .where("id", "=", "show-1")
      .execute();

    stubTmdbFetch(async (url) => {
      if (url.includes("/search/tv")) {
        return Response.json({ results: [{ id: 1396, name: "Local Show", first_air_date: "2008-01-20" }] });
      }
      if (url.includes("/tv/1396/season/1")) {
        return Response.json({
          id: 3572,
          name: "Season 1",
          season_number: 1,
          air_date: "2008-01-20",
          episodes: [{ id: 62085, name: "Pilot", season_number: 1, episode_number: 1, air_date: "2008-01-20" }],
        });
      }
      if (url.includes("/tv/1396")) {
        return Response.json({ id: 1396, name: "Local Show", first_air_date: "2008-01-20" });
      }
      return new Response("{}", { status: 404 });
    });

    const response = await showMatchDelete(matchDeleteEvent("show-1", adminLocals()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaItemId: "show-1" });
  });

  test("clears the movie flag and returns 200 even when the automatic re-match finds nothing", async () => {
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "603", manual_match: 1 })
      .where("id", "=", "movie-1")
      .execute();

    stubTmdbFetch(async (url) => {
      if (url.includes("/search/movie")) return Response.json({ results: [] });
      return new Response("{}", { status: 404 });
    });

    const response = await movieMatchDelete(matchDeleteEvent("movie-1", adminLocals()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaItemId: null });
  });

  test("clears the show flag and returns 200 even when the automatic re-match finds nothing", async () => {
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "1396", manual_match: 1 })
      .where("id", "=", "show-1")
      .execute();

    stubTmdbFetch(async (url) => {
      if (url.includes("/search/tv")) return Response.json({ results: [] });
      return new Response("{}", { status: 404 });
    });

    const response = await showMatchDelete(matchDeleteEvent("show-1", adminLocals()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaItemId: null });
  });

  test("clears the show flag and returns 200 when the show has no seasons", async () => {
    await db.deleteFrom("media_item").where("id", "=", "season-1").execute();
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "1396", manual_match: 1 })
      .where("id", "=", "show-1")
      .execute();

    const response = await showMatchDelete(matchDeleteEvent("show-1", adminLocals()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaItemId: "show-1" });
  });

  test("clears the movie flag and returns 200 when the movie has no files", async () => {
    await db
      .updateTable("media_item")
      .set({ provider: "tmdb", provider_id: "603", manual_match: 1 })
      .where("id", "=", "movie-1")
      .execute();
    await db.deleteFrom("media_file").where("id", "=", "file-1").execute();

    const response = await movieMatchDelete(matchDeleteEvent("movie-1", adminLocals()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaItemId: "movie-1" });
  });
});
