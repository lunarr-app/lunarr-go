import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
} from "$lib/server/db";
import type { Database } from "$lib/server/db/schema";
import {
  getBooleanSetting,
  getSetting,
  setSetting,
} from "$lib/server/settings";
import { registerTranscodeHlsArtifact } from "$lib/server/transcoding/sessions";
import type { TranscodePolicy } from "$lib/server/transcoding/policy";
import { actions, load } from "./+page.server";

type SettingsLoadResult = {
  signupOpen: boolean;
  tmdbConfigured: boolean;
  tmdbAccessTokenConfigured: boolean;
  tmdbAccessTokenSaved: boolean;
  tmdbApiKeyConfigured: boolean;
  tmdbApiKeySaved: boolean;
  transcodePolicy: TranscodePolicy;
  version: string;
  status: {
    libraries: number;
    movies: number;
    activeScanJobs: number;
  };
};

async function waitForJob(db: Kysely<Database>, jobId: string) {
  let job = await db
    .selectFrom("scan_job")
    .selectAll()
    .where("id", "=", jobId)
    .executeTakeFirstOrThrow();
  for (
    let index = 0;
    index < 50 && (job.status === "queued" || job.status === "running");
    index += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    job = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("id", "=", jobId)
      .executeTakeFirstOrThrow();
  }
  return job;
}

describe("settings page server", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-settings-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("saves admin-controlled signup, transcoding, and TMDb settings", async () => {
    const registrationForm = new FormData();
    registrationForm.set("signupOpen", "on");

    try {
      await actions.saveRegistration({
        request: new Request("http://localhost/settings", {
          method: "POST",
          body: registrationForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never);
      throw new Error("Expected registration save to redirect.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 303,
        location: "/settings",
      });
    }

    const metadataForm = new FormData();
    metadataForm.set("tmdbAccessToken", "saved-access-token");
    metadataForm.set("tmdbApiKey", "saved-api-key");

    try {
      await actions.saveMetadata({
        request: new Request("http://localhost/settings", {
          method: "POST",
          body: metadataForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never);
      throw new Error("Expected metadata save to redirect.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 303,
        location: "/settings",
      });
    }

    expect(await getBooleanSetting("signup_open", false)).toBe(true);
    expect(await getSetting("tmdb_access_token")).toBe("saved-access-token");
    expect(await getSetting("tmdb_api_key")).toBe("saved-api-key");

    const transcodingForm = new FormData();
    transcodingForm.set("hardwareAcceleration", "videotoolbox");
    transcodingForm.set("hardwareAccelerationRequired", "on");
    const now = new Date().toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "User",
        email: "user@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: Date.now(),
        updated_at: Date.now(),
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
      .values({
        id: "movie-1",
        kind: "movie",
        title: "Movie",
        sort_title: "movie",
        year: 2026,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "2026-01-01",
        provider: null,
        provider_id: null,
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
        path: path.join(tempDir, "Movie.2026.mkv"),
        basename: "Movie.2026.mkv",
        extension: ".mkv",
        size_bytes: 10,
        mtime_ms: Date.now(),
        duration_seconds: null,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "matroska",
        created_at: now,
        updated_at: now,
      })
      .execute();
    const playbackSessionArtifactDir = path.join(
      tempDir,
      "playback-sessions",
      "transcode-1",
    );
    const playbackSessionPlaylistPath = path.join(
      playbackSessionArtifactDir,
      "master.m3u8",
    );
    await mkdir(playbackSessionArtifactDir, { recursive: true });
    await writeFile(playbackSessionPlaylistPath, "#EXTM3U\n");
    await db
      .insertInto("playback_session")
      .values({
        id: "transcode-1",
        media_file_id: "file-1",
        user_id: "user-1",
        status: "running",
        mode: "transcode",
        error_message: null,
        last_heartbeat_at: now,
        last_segment_request_at: null,
        last_segment_name: null,
        last_segment_index: null,
        start_time_seconds: 0,
        started_at: now,
        finished_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await registerTranscodeHlsArtifact({
      sessionId: "transcode-1",
      mediaFileId: "file-1",
      path: playbackSessionPlaylistPath,
    });

    try {
      await actions.saveTranscoding({
        request: new Request("http://localhost/settings", {
          method: "POST",
          body: transcodingForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never);
      throw new Error("Expected transcoding save to redirect.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 303,
        location: "/settings",
      });
    }

    const data = (await load({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never)) as SettingsLoadResult;

    expect(data).toMatchObject({
      signupOpen: true,
      tmdbConfigured: true,
      tmdbAccessTokenConfigured: true,
      tmdbAccessTokenSaved: true,
      tmdbApiKeyConfigured: true,
      tmdbApiKeySaved: true,
      transcodePolicy: {
        transcodingEnabled: false,
        playbackPreference: "auto",
        hardwareAcceleration: "videotoolbox",
        hardwareAccelerationRequired: true,
      },
      status: {
        libraries: 1,
        movies: 1,
        activeScanJobs: 0,
      },
    });
    expect(data.version).toMatch(/^\d+\.\d+\.\d+/);

    const transcodeSession = await db
      .selectFrom("playback_session")
      .select(["status", "error_message"])
      .where("id", "=", "transcode-1")
      .executeTakeFirstOrThrow();
    expect(transcodeSession).toEqual({
      status: "cancelled",
      error_message: "Transcoding is disabled by an administrator.",
    });
    expect(
      await stat(playbackSessionArtifactDir).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(
      await db
        .selectFrom("playback_hls_artifact")
        .select("id")
        .where("playback_session_id", "=", "transcode-1")
        .execute(),
    ).toHaveLength(0);
  });

  test("reports TMDb as configured by bundled fallback when no user credential exists", async () => {
    const data = (await load({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never)) as SettingsLoadResult;

    expect(data).toMatchObject({
      tmdbConfigured: true,
      tmdbAccessTokenConfigured: false,
      tmdbApiKeyConfigured: false,
    });
  });

  test("does not save hardware-required policy when hardware mode is off", async () => {
    const transcodingForm = new FormData();
    transcodingForm.set("transcodingEnabled", "on");
    transcodingForm.set("hardwareAcceleration", "off");
    transcodingForm.set("hardwareAccelerationRequired", "on");

    try {
      await actions.saveTranscoding({
        request: new Request("http://localhost/settings", {
          method: "POST",
          body: transcodingForm,
        }),
        locals: { user: { id: "admin-1", role: "admin" } },
      } as never);
      throw new Error("Expected transcoding save to redirect.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 303,
        location: "/settings",
      });
    }

    const data = (await load({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never)) as SettingsLoadResult;

    expect(data.transcodePolicy).toMatchObject({
      transcodingEnabled: true,
      hardwareAcceleration: "off",
      hardwareAccelerationRequired: false,
    });
    expect(await getSetting("hardware_acceleration_required")).toBe("false");
  });

  test("keeps settings writes admin-only", async () => {
    const registrationForm = new FormData();
    registrationForm.set("signupOpen", "on");

    const registrationResult = await actions.saveRegistration({
      request: new Request("http://localhost/settings", {
        method: "POST",
        body: registrationForm,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(registrationResult).toMatchObject({
      status: 403,
      data: {
        registrationError: "Only admins can update registration settings.",
      },
    });

    const metadataForm = new FormData();
    metadataForm.set("tmdbAccessToken", "saved-access-token");
    const metadataResult = await actions.saveMetadata({
      request: new Request("http://localhost/settings", {
        method: "POST",
        body: metadataForm,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(metadataResult).toMatchObject({
      status: 403,
      data: {
        metadataSaveError: "Only admins can update metadata settings.",
      },
    });

    const transcodingForm = new FormData();
    transcodingForm.set("transcodingEnabled", "on");
    const transcodingResult = await actions.saveTranscoding({
      request: new Request("http://localhost/settings", {
        method: "POST",
        body: transcodingForm,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(transcodingResult).toMatchObject({
      status: 403,
      data: {
        transcodingError: "Only admins can update transcoding settings.",
      },
    });
    expect(await getBooleanSetting("signup_open", false)).toBe(false);
    expect(await getSetting("tmdb_access_token")).toBeNull();
    expect(await getSetting("transcoding_enabled")).toBeNull();
  });

  test("metadata refresh requires an admin and uses bundled fallback when no user credential exists", async () => {
    const userResult = await actions.refreshMetadata({
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(userResult).toMatchObject({
      status: 403,
      data: {
        metadataError: "Only admins can refresh metadata.",
      },
    });

    const adminResult = await actions.refreshMetadata({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);

    expect(adminResult).toEqual({
      metadataMessage:
        "Started movie metadata refresh. Track progress in Jobs.",
    });
    const job = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("library_id", "is", null)
      .executeTakeFirstOrThrow();
    expect(await waitForJob(db, job.id)).toMatchObject({
      status: "completed",
      files_seen: 0,
    });
  });

  test("metadata refresh uses saved TMDb credentials to update local movies", async () => {
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
        title: "The Matrix",
        sort_title: "matrix",
        year: 1999,
        overview: null,
        runtime_seconds: null,
        poster_path: null,
        backdrop_path: null,
        release_date: "1999-01-01",
        provider: null,
        provider_id: null,
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
        size_bytes: 6,
        mtime_ms: Date.now(),
        duration_seconds: null,
        video_codec: null,
        audio_codec: null,
        container: "mkv",
        created_at: now,
        updated_at: now,
      })
      .execute();
    await setSetting("tmdb_api_key", "saved-api-key");

    const calls: string[] = [];
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            { id: 603, title: "The Matrix", release_date: "1999-03-31" },
          ],
        });
      }

      return Response.json({
        id: 603,
        title: "The Matrix",
        overview: "A hacker discovers the nature of reality.",
        release_date: "1999-03-31",
        runtime: 136,
        poster_path: "/matrix.jpg",
        backdrop_path: "/matrix-backdrop.jpg",
        popularity: 100,
        vote_average: 8.3,
        genres: [{ id: 878, name: "Science Fiction" }],
      });
    }) as typeof fetch;

    const result = await actions.refreshMetadata({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);

    expect(result).toEqual({
      metadataMessage:
        "Started movie metadata refresh. Track progress in Jobs.",
    });
    const job = await db
      .selectFrom("scan_job")
      .selectAll()
      .where("library_id", "is", null)
      .executeTakeFirstOrThrow();
    expect(await waitForJob(db, job.id)).toMatchObject({
      status: "completed",
      files_seen: 1,
      files_updated: 1,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("api_key=saved-api-key");

    const movie = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", "movie-1")
      .executeTakeFirstOrThrow();
    expect(movie).toMatchObject({
      provider: "tmdb",
      provider_id: "603",
      poster_path: "/matrix.jpg",
      backdrop_path: "/matrix-backdrop.jpg",
      runtime_seconds: 8160,
    });
    expect(
      await db
        .selectFrom("media_item_genre")
        .select(["name"])
        .where("media_item_id", "=", "movie-1")
        .execute(),
    ).toEqual([{ name: "Science Fiction" }]);
  });

  test("TMDb connection test is admin-only and can use the bundled fallback", async () => {
    const userResult = await actions.testTmdb({
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(userResult).toMatchObject({
      status: 403,
      data: {
        tmdbTestMessage: "Only admins can test metadata settings.",
        tmdbTestOk: false,
      },
    });

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
            { id: 603, title: "The Matrix", release_date: "1999-03-31" },
          ],
        });
      }

      return Response.json({
        id: 603,
        title: "The Matrix",
        release_date: "1999-03-31",
        poster_path: "/matrix.jpg",
      });
    }) as typeof fetch;

    const adminResult = await actions.testTmdb({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);
    expect(adminResult).toEqual({
      tmdbTestMessage: "TMDb returned The Matrix (1999).",
      tmdbTestOk: true,
    });
  });

  test("TMDb connection test uses saved credentials", async () => {
    await setSetting("tmdb_api_key", "saved-api-key");
    const calls: string[] = [];
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);

      if (url.includes("/search/movie")) {
        return Response.json({
          results: [
            { id: 603, title: "The Matrix", release_date: "1999-03-31" },
          ],
        });
      }

      return Response.json({
        id: 603,
        title: "The Matrix",
        release_date: "1999-03-31",
        runtime: 136,
        poster_path: "/matrix.jpg",
      });
    }) as typeof fetch;

    const result = await actions.testTmdb({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);

    expect(result).toEqual({
      tmdbTestMessage: "TMDb returned The Matrix (1999).",
      tmdbTestOk: true,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("api_key=saved-api-key");
  });

  test("scan-all action requires an admin and at least one library", async () => {
    const userResult = await actions.scanAll({
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(userResult).toMatchObject({
      status: 403,
      data: {
        scanError: "Only admins can scan libraries.",
      },
    });

    const adminResult = await actions.scanAll({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);
    expect(adminResult).toMatchObject({
      status: 400,
      data: {
        scanError: "No libraries are configured.",
      },
    });
  });

  test("TV metadata repair refreshes existing shows without scanning libraries", async () => {
    const userResult = await actions.refreshTvMetadata({
      locals: { user: { id: "user-1", role: "user" } },
    } as never);
    expect(userResult).toMatchObject({
      status: 403,
      data: {
        tvMetadataError: "Only admins can refresh TV metadata.",
      },
    });

    const now = new Date().toISOString();
    await db
      .insertInto("media_item")
      .values([
        {
          id: "show-1",
          kind: "show",
          title: "The Expanse",
          sort_title: "expanse",
          year: 2015,
          parent_id: null,
          provider: null,
          provider_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "season-1",
          kind: "season",
          title: "Season 1",
          sort_title: "0001",
          season_number: 1,
          parent_id: "show-1",
          provider: null,
          provider_id: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: "episode-1",
          kind: "episode",
          title: "Episode 1",
          sort_title: "s001e0001",
          season_number: 1,
          episode_number: 1,
          parent_id: "season-1",
          provider: null,
          provider_id: null,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/search/tv")) {
        return Response.json({
          results: [
            {
              id: 63639,
              name: "The Expanse",
              first_air_date: "2015-12-14",
            },
          ],
        });
      }

      if (url.includes("/tv/63639/season/1")) {
        return Response.json({
          id: 60001,
          name: "Season 1",
          overview: "The first season.",
          air_date: "2015-12-14",
          poster_path: "/season.jpg",
          season_number: 1,
          episodes: [
            {
              id: 70001,
              name: "Dulcinea",
              overview: "The opener.",
              air_date: "2015-12-14",
              episode_number: 1,
              season_number: 1,
              runtime: 45,
              still_path: "/episode-1.jpg",
              vote_average: 8.1,
              vote_count: 10,
            },
            {
              id: 70002,
              name: "The Big Empty",
              overview: "The second episode.",
              air_date: "2015-12-15",
              episode_number: 2,
              season_number: 1,
              runtime: 44,
              still_path: "/episode-2.jpg",
              vote_average: 8.2,
              vote_count: 11,
            },
          ],
        });
      }

      return Response.json({
        id: 63639,
        name: "The Expanse",
        original_name: "The Expanse",
        overview: "A missing person case becomes a system-wide mystery.",
        first_air_date: "2015-12-14",
        poster_path: "/show.jpg",
        backdrop_path: "/backdrop.jpg",
        popularity: 100,
        vote_average: 8.4,
        vote_count: 2000,
        status: "Ended",
        genres: [{ id: 10765, name: "Sci-Fi & Fantasy" }],
      });
    }) as typeof fetch;

    const result = await actions.refreshTvMetadata({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);
    expect(result).toEqual({
      tvMetadataMessage: "Started TV metadata refresh. Track progress in Jobs.",
    });

    const jobs = await db
      .selectFrom("scan_job")
      .select(["id", "job_kind", "library_id"])
      .execute();
    expect(jobs).toMatchObject([
      {
        job_kind: "tv_metadata_refresh",
        library_id: null,
      },
    ]);
    expect(await waitForJob(db, jobs[0].id)).toMatchObject({
      library_id: null,
      job_kind: "tv_metadata_refresh",
      status: "completed",
      files_seen: 1,
      files_added: 1,
      files_updated: 1,
    });

    const show = await db
      .selectFrom("media_item")
      .selectAll()
      .where("id", "=", "show-1")
      .executeTakeFirstOrThrow();
    expect(show).toMatchObject({
      provider: "tmdb",
      provider_id: "63639",
      poster_path: "/show.jpg",
    });
    const episodes = await db
      .selectFrom("media_item")
      .select(["title", "provider_id"])
      .where("kind", "=", "episode")
      .orderBy("episode_number", "asc")
      .execute();
    expect(episodes).toEqual([
      { title: "Dulcinea", provider_id: "70001" },
      { title: "The Big Empty", provider_id: "70002" },
    ]);
  });

  test("scan-all action starts scans for configured libraries", async () => {
    const now = new Date().toISOString();
    const libraryDir = path.join(tempDir, "Movies");
    const tvLibraryDir = path.join(tempDir, "TV");
    await mkdir(libraryDir);
    await mkdir(tvLibraryDir);
    await db
      .insertInto("library")
      .values([
        {
          id: "library-1",
          name: "Movies",
          kind: "movie",
          path: libraryDir,
          created_at: now,
          updated_at: now,
        },
        {
          id: "library-2",
          name: "TV",
          kind: "tv",
          path: tvLibraryDir,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    const result = await actions.scanAll({
      locals: { user: { id: "admin-1", role: "admin" } },
    } as never);

    expect(result).toEqual({
      scanMessage: "Started 2 scans for 2 libraries.",
    });
    let jobs = await db
      .selectFrom("scan_job")
      .selectAll()
      .orderBy("library_id", "asc")
      .execute();
    for (
      let index = 0;
      index < 20 &&
      jobs.some((job) => job.status === "queued" || job.status === "running");
      index += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      jobs = await db
        .selectFrom("scan_job")
        .selectAll()
        .orderBy("library_id", "asc")
        .execute();
    }

    expect(jobs.map((job) => job.library_id)).toEqual([
      "library-1",
      "library-2",
    ]);
    expect(jobs).toMatchObject([
      { library_id: "library-1", status: "completed", files_seen: 0 },
      { library_id: "library-2", status: "completed", files_seen: 0 },
    ]);
  });
});
