import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { GET as personGet } from "../../../routes/api/people/[provider]/[id]/+server";
import { getPersonDetail, PERSON_FILMOGRAPHY_PAGE_SIZE } from "./people";

describe("person filmography pagination", () => {
  let tempDir: string;
  let db: Kysely<Database>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-people-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "data", "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const movieCount = PERSON_FILMOGRAPHY_PAGE_SIZE + 1;

    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Person User",
        email: "person@example.com",
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

    const movies = Array.from({ length: movieCount }, (_, index) => {
      const number = index + 1;
      return {
        id: `movie-${number}`,
        kind: "movie" as const,
        title: `Movie ${number}`,
        sort_title: `movie ${String(number).padStart(4, "0")}`,
        year: 2000 + index,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: `${2000 + index}-01-01`,
        provider: "tmdb",
        provider_id: `movie-${number}`,
        parent_id: null,
        popularity: null,
        vote_average: null,
        created_at: now,
        updated_at: now,
      };
    });

    await db.insertInto("media_item").values(movies).execute();
    await db
      .insertInto("media_file")
      .values(
        movies.map((movie, index) => ({
          id: `file-${index + 1}`,
          library_id: "library-1",
          media_item_id: movie.id,
          path: path.join(tempDir, `${movie.id}.mp4`),
          basename: `${movie.id}.mp4`,
          extension: ".mp4",
          size_bytes: 10,
          mtime_ms: nowMs,
          duration_seconds: null,
          video_codec: null,
          audio_codec: null,
          container: "mp4",
          created_at: now,
          updated_at: now,
        })),
      )
      .execute();
    await db
      .insertInto("media_item_credit")
      .values(
        movies.map((movie, index) => ({
          media_item_id: movie.id,
          credit_type: "cast" as const,
          provider: "tmdb",
          provider_id: "person-1",
          credit_id: `credit-${index + 1}`,
          name: "Busy Actor",
          original_name: null,
          profile_path: "/actor.jpg",
          credit_order: index,
          department: null,
          job: null,
          character_name: `Role ${index + 1}`,
        })),
      )
      .execute();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("paginates movie credits and keeps aggregate stats", async () => {
    const pageOne = await getPersonDetail("tmdb", "person-1", "user-1", { moviePage: 1 });
    expect(pageOne?.stats.movieCount).toBe(PERSON_FILMOGRAPHY_PAGE_SIZE + 1);
    expect(pageOne?.movies).toHaveLength(PERSON_FILMOGRAPHY_PAGE_SIZE);
    expect(pageOne?.moviePage).toMatchObject({
      page: 1,
      total: PERSON_FILMOGRAPHY_PAGE_SIZE + 1,
      totalPages: 2,
      hasNext: true,
    });

    const pageTwo = await getPersonDetail("tmdb", "person-1", "user-1", { moviePage: 2 });
    expect(pageTwo?.movies).toHaveLength(1);
    expect(pageTwo?.moviePage).toMatchObject({
      page: 2,
      total: PERSON_FILMOGRAPHY_PAGE_SIZE + 1,
      hasPrevious: true,
      hasNext: false,
    });
  });

  test("exposes moviesPage and showsPage query params on the HTTP route", async () => {
    const response = await personGet({
      params: { provider: "tmdb", id: "person-1" },
      locals: { user: { id: "user-1", role: "user" } },
      url: new URL("http://localhost/api/people/tmdb/person-1?moviesPage=2&showsPage=1"),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stats.movieCount).toBe(PERSON_FILMOGRAPHY_PAGE_SIZE + 1);
    expect(body.movies).toHaveLength(1);
    expect(body.moviePage.page).toBe(2);
    expect(body.showPage.total).toBe(0);
  });
});
