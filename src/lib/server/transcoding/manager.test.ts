import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import type { HlsSegmentWindowTranscodeInput } from "./backend";
import {
  acquirePlaybackCache,
  computePlaybackCacheId,
  computePlaybackPolicyHash,
  setEncodeAheadSegmentCount,
} from "./cache";
import {
  cleanupTranscodeStartupFailure,
  ensureHlsLookaheadForSegment,
  ensureHlsSegmentForRequest,
  setTranscodeBackendForTests,
} from "./manager";
import { setTranscodingEnabled, transcodeQualityTarget } from "./policy";
import { expectRejectsToThrow } from "../../test/async-expect";
import {
  createTranscodeSession,
  registerTranscodeHlsArtifact,
  updateTranscodeSessionPipeline,
  updateTranscodeSessionStatus,
} from "./sessions";

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for test condition.");
}

describe("request-driven HLS manager", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  let sessionId: string;
  let playlistPath: string;
  let nowMs: number;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-transcode-manager-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();

    nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Playback User",
        email: "playback@example.com",
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
        source: "local",
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
    await writeFile(path.join(tempDir, "Movie.2026.mkv"), "source-media");
    await db
      .insertInto("media_file")
      .values({
        id: "file-1",
        library_id: "library-1",
        media_item_id: "movie-1",
        path: path.join(tempDir, "Movie.2026.mkv"),
        basename: "Movie.2026.mkv",
        extension: ".mkv",
        size_bytes: 100,
        mtime_ms: nowMs,
        duration_seconds: 600,
        video_codec: "hevc",
        audio_codec: "dts",
        container: "mkv",
        created_at: now,
        updated_at: now,
      })
      .execute();

    sessionId = await createTranscodeSession({
      mediaFileId: "file-1",
      userId: "user-1",
    });
    await updateTranscodeSessionPipeline(sessionId, "request_driven");
    const artifactDir = path.join(tempDir, "playback-sessions", sessionId);
    await mkdir(artifactDir, { recursive: true });
    playlistPath = path.join(artifactDir, "master.m3u8");
    await writeFile(playlistPath, "#EXTM3U\n");
    await registerTranscodeHlsArtifact({
      sessionId,
      mediaFileId: "file-1",
      path: playlistPath,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionId, "running");
  });

  afterEach(async () => {
    setTranscodeBackendForTests(null);
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("does not abort far-ahead segment generation when stale forward lookahead is requested", async () => {
    let releaseFarSegment: (() => void) | undefined;
    const farSegmentGate = new Promise<void>((resolve) => {
      releaseFarSegment = resolve;
    });
    let farBackendStarted = false;

    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input: HlsSegmentWindowTranscodeInput) {
        const segment = input.segments[0]?.segment;
        if (!segment) throw new Error("Expected a requested HLS window segment.");

        if (segment === "segment-00016.ts") {
          farBackendStarted = true;
          await farSegmentGate;
          await mkdir(input.artifactDirectory, { recursive: true });
          await writeFile(path.join(input.artifactDirectory, segment), segment);
          return { completion: Promise.resolve() };
        }

        if (segment === "segment-00001.ts") {
          return new Promise((_resolve, reject) => {
            input.signal?.addEventListener(
              "abort",
              () => {
                reject(new Error("stale lookahead aborted"));
              },
              { once: true },
            );
          });
        }

        await mkdir(input.artifactDirectory, { recursive: true });
        for (const windowSegment of input.segments) {
          await writeFile(path.join(input.artifactDirectory, windowSegment.segment), windowSegment.segment);
        }
        return { completion: Promise.resolve() };
      },
      async cancel() {
        return;
      },
    });

    const farGeneration = ensureHlsSegmentForRequest({
      sessionId,
      userId: "user-1",
      segment: "segment-00016.ts",
    });

    await waitFor(() => farBackendStarted);

    const lookaheadGeneration = ensureHlsSegmentForRequest({
      sessionId,
      userId: "user-1",
      segment: "segment-00001.ts",
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseFarSegment?.();

    expect(await farGeneration).toBe(true);
    void lookaheadGeneration.catch(() => undefined);
  });

  test("ensureHlsLookaheadForSegment reads ahead from the shared encode directory", async () => {
    let generationCalls = 0;
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        generationCalls += 1;
        throw new Error("lookahead should not invoke FFmpeg");
      },
      async cancel() {
        return;
      },
    });

    const { encodeArtifactDirectory } = await acquirePlaybackCache({
      sessionId,
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policy: {
        transcodingEnabled: true,
        playbackPreference: "auto",
        preferredAudioLanguage: null,
        preferredSubtitleLanguage: null,
        hardwareAcceleration: "off",
        hardwareAccelerationRequired: false,
        transcodeQualityPreset: "auto",
        transcodeQuality: transcodeQualityTarget("auto"),
      },
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });
    await mkdir(encodeArtifactDirectory, { recursive: true });
    for (let index = 1; index <= 8; index += 1) {
      await writeFile(path.join(encodeArtifactDirectory, `segment-${String(index).padStart(5, "0")}.ts`), "cached");
    }

    await db
      .updateTable("playback_session")
      .set({
        last_segment_index: 0,
        last_segment_name: "segment-00000.ts",
      })
      .where("id", "=", sessionId)
      .execute();

    expect(
      await ensureHlsLookaheadForSegment({
        sessionId,
        userId: "user-1",
        segment: "segment-00000.ts",
      }),
    ).toBe(true);
    expect(generationCalls).toBe(0);
  });

  test("cancels forward encode when the playhead seeks backward beyond the active window", async () => {
    let forwardEncodeStarted = false;
    let forwardEncodeAborted = false;

    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input: HlsSegmentWindowTranscodeInput) {
        const segment = input.segments[0]?.segment;
        if (!segment) throw new Error("Expected a requested HLS window segment.");
        if (segment === "segment-00016.ts") {
          forwardEncodeStarted = true;
          await new Promise<void>((_resolve, reject) => {
            input.signal?.addEventListener(
              "abort",
              () => {
                forwardEncodeAborted = true;
                reject(new Error("forward encode aborted"));
              },
              { once: true },
            );
          });
        }
        await mkdir(input.artifactDirectory, { recursive: true });
        for (const windowSegment of input.segments) {
          await writeFile(path.join(input.artifactDirectory, windowSegment.segment), windowSegment.segment);
        }
        return { completion: Promise.resolve() };
      },
      async cancel() {
        return;
      },
    });

    await db
      .updateTable("playback_session")
      .set({
        last_segment_index: 16,
        last_segment_name: "segment-00016.ts",
      })
      .where("id", "=", sessionId)
      .execute();

    const forwardGeneration = ensureHlsSegmentForRequest({
      sessionId,
      userId: "user-1",
      segment: "segment-00016.ts",
    });
    await waitFor(() => forwardEncodeStarted);

    const backwardGeneration = ensureHlsSegmentForRequest({
      sessionId,
      userId: "user-1",
      segment: "segment-00005.ts",
    });

    await waitFor(() => forwardEncodeAborted);
    expect(await backwardGeneration).toBe(true);
    void forwardGeneration.catch(() => undefined);
  });

  test("releases cache refs when segment generation fails", async () => {
    const { cacheId } = await acquirePlaybackCache({
      sessionId,
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policy: {
        transcodingEnabled: true,
        playbackPreference: "auto",
        preferredAudioLanguage: null,
        preferredSubtitleLanguage: null,
        hardwareAcceleration: "off",
        hardwareAccelerationRequired: false,
        transcodeQualityPreset: "auto",
        transcodeQuality: transcodeQualityTarget("auto"),
      },
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });

    setTranscodeBackendForTests({
      async generateHlsSegmentWindow() {
        throw new Error("encode failed");
      },
      async cancel() {
        return;
      },
    });

    await expectRejectsToThrow(
      ensureHlsSegmentForRequest({
        sessionId,
        userId: "user-1",
        segment: "segment-00000.ts",
      }),
      "encode failed",
    );

    const cache = await db
      .selectFrom("playback_hls_cache")
      .select(["ref_count"])
      .where("id", "=", cacheId)
      .executeTakeFirstOrThrow();
    expect(cache.ref_count).toBe(0);
    const session = await db
      .selectFrom("playback_session")
      .select(["cache_id"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.cache_id).toBeNull();
  });

  test("remux fallback acquires a separate transcode cache entry", async () => {
    const samplePolicy = {
      transcodingEnabled: true,
      playbackPreference: "auto" as const,
      preferredAudioLanguage: null,
      preferredSubtitleLanguage: null,
      hardwareAcceleration: "off" as const,
      hardwareAccelerationRequired: false,
      transcodeQualityPreset: "auto" as const,
      transcodeQuality: transcodeQualityTarget("auto"),
    };

    await acquirePlaybackCache({
      sessionId,
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "remux",
      policy: samplePolicy,
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });

    let generationModes: string[] = [];
    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input: HlsSegmentWindowTranscodeInput) {
        generationModes.push(input.mode ?? "unknown");
        if (input.mode === "remux") {
          throw new Error("remux failed");
        }
        await mkdir(input.artifactDirectory, { recursive: true });
        for (const windowSegment of input.segments) {
          await writeFile(path.join(input.artifactDirectory, windowSegment.segment), windowSegment.segment);
        }
        return { completion: Promise.resolve() };
      },
      async cancel() {
        return;
      },
    });

    await db.updateTable("playback_session").set({ mode: "remux" }).where("id", "=", sessionId).execute();

    expect(
      await ensureHlsSegmentForRequest({
        sessionId,
        userId: "user-1",
        segment: "segment-00000.ts",
      }),
    ).toBe(true);
    expect(generationModes).toEqual(["remux", "transcode"]);

    const session = await db
      .selectFrom("playback_session")
      .leftJoin("playback_hls_cache", "playback_hls_cache.id", "playback_session.cache_id")
      .select(["playback_hls_cache.mode as cacheMode", "playback_hls_cache.id as cacheId"])
      .where("playback_session.id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.cacheMode).toBe("transcode");
    const transcodeCacheId = computePlaybackCacheId({
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policyHash: computePlaybackPolicyHash({
        policy: samplePolicy,
        segmentFormat: "mpegts",
        audioStreamIndex: null,
      }),
    });
    expect(session.cacheId).toBe(transcodeCacheId);
  });

  test("cleanupTranscodeStartupFailure releases only the failed session cache ref", async () => {
    const samplePolicy = {
      transcodingEnabled: true,
      playbackPreference: "auto" as const,
      preferredAudioLanguage: null,
      preferredSubtitleLanguage: null,
      hardwareAcceleration: "off" as const,
      hardwareAccelerationRequired: false,
      transcodeQualityPreset: "auto" as const,
      transcodeQuality: transcodeQualityTarget("auto"),
    };
    const sessionB = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    const { cacheId } = await acquirePlaybackCache({
      sessionId,
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policy: samplePolicy,
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });
    await acquirePlaybackCache({
      sessionId: sessionB,
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policy: samplePolicy,
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });

    await cleanupTranscodeStartupFailure(sessionB);

    const cache = await db
      .selectFrom("playback_hls_cache")
      .select(["ref_count"])
      .where("id", "=", cacheId)
      .executeTakeFirstOrThrow();
    expect(cache.ref_count).toBe(1);
    expect(
      await db
        .selectFrom("playback_session")
        .select(["cache_id"])
        .where("id", "=", sessionId)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ cache_id: cacheId });
    expect(
      await db.selectFrom("playback_session").select(["cache_id"]).where("id", "=", sessionB).executeTakeFirstOrThrow(),
    ).toMatchObject({ cache_id: null });
  });

  test("removes failed partial segments from the shared encode directory", async () => {
    const samplePolicy = {
      transcodingEnabled: true,
      playbackPreference: "auto" as const,
      preferredAudioLanguage: null,
      preferredSubtitleLanguage: null,
      hardwareAcceleration: "off" as const,
      hardwareAccelerationRequired: false,
      transcodeQualityPreset: "auto" as const,
      transcodeQuality: transcodeQualityTarget("auto"),
    };
    const { encodeArtifactDirectory } = await acquirePlaybackCache({
      sessionId,
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policy: samplePolicy,
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });

    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input: HlsSegmentWindowTranscodeInput) {
        await mkdir(input.artifactDirectory, { recursive: true });
        await writeFile(path.join(input.artifactDirectory, "segment-00000.ts"), "partial");
        throw new Error("encode failed");
      },
      async cancel() {
        return;
      },
    });

    await expectRejectsToThrow(
      ensureHlsSegmentForRequest({
        sessionId,
        userId: "user-1",
        segment: "segment-00000.ts",
      }),
      "encode failed",
    );

    await expect(stat(path.join(encodeArtifactDirectory, "segment-00000.ts"))).rejects.toThrow();
  });

  test("releases cache refs when transcoding is disabled before segment generation", async () => {
    const samplePolicy = {
      transcodingEnabled: true,
      playbackPreference: "auto" as const,
      preferredAudioLanguage: null,
      preferredSubtitleLanguage: null,
      hardwareAcceleration: "off" as const,
      hardwareAccelerationRequired: false,
      transcodeQualityPreset: "auto" as const,
      transcodeQuality: transcodeQualityTarget("auto"),
    };
    const { cacheId } = await acquirePlaybackCache({
      sessionId,
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policy: samplePolicy,
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });

    await setTranscodingEnabled(false);
    expect(
      await ensureHlsSegmentForRequest({
        sessionId,
        userId: "user-1",
        segment: "segment-00000.ts",
      }),
    ).toBe(false);

    const cache = await db
      .selectFrom("playback_hls_cache")
      .select(["ref_count"])
      .where("id", "=", cacheId)
      .executeTakeFirstOrThrow();
    expect(cache.ref_count).toBe(0);
    await setTranscodingEnabled(true);
  });

  test("serializes encode work for sessions sharing the same cache entry", async () => {
    const samplePolicy = {
      transcodingEnabled: true,
      playbackPreference: "auto" as const,
      preferredAudioLanguage: null,
      preferredSubtitleLanguage: null,
      hardwareAcceleration: "off" as const,
      hardwareAccelerationRequired: false,
      transcodeQualityPreset: "auto" as const,
      transcodeQuality: transcodeQualityTarget("auto"),
    };
    const sessionB = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    await updateTranscodeSessionPipeline(sessionB, "request_driven");
    const artifactDirB = path.join(tempDir, "playback-sessions", sessionB);
    await mkdir(artifactDirB, { recursive: true });
    const playlistPathB = path.join(artifactDirB, "master.m3u8");
    await writeFile(playlistPathB, "#EXTM3U\n");
    await registerTranscodeHlsArtifact({
      sessionId: sessionB,
      mediaFileId: "file-1",
      path: playlistPathB,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionB, "running");
    await acquirePlaybackCache({
      sessionId,
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policy: samplePolicy,
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });
    await acquirePlaybackCache({
      sessionId: sessionB,
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policy: samplePolicy,
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });
    await setEncodeAheadSegmentCount(1);

    let releaseSessionA: (() => void) | undefined;
    const sessionAGate = new Promise<void>((resolve) => {
      releaseSessionA = resolve;
    });
    let sessionAEncodeStarted = false;
    let sessionBEncodeStarted = false;
    let activeEncodes = 0;
    let maxConcurrentEncodes = 0;

    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input: HlsSegmentWindowTranscodeInput) {
        activeEncodes += 1;
        maxConcurrentEncodes = Math.max(maxConcurrentEncodes, activeEncodes);
        try {
          const segment = input.segments[0]?.segment;
          if (!segment) throw new Error("Expected a requested HLS window segment.");
          if (input.sessionId === sessionId && segment === "segment-00010.ts") {
            sessionAEncodeStarted = true;
            await sessionAGate;
          }
          if (input.sessionId === sessionB && segment === "segment-00030.ts") {
            sessionBEncodeStarted = true;
          }
          await mkdir(input.artifactDirectory, { recursive: true });
          for (const windowSegment of input.segments) {
            await writeFile(path.join(input.artifactDirectory, windowSegment.segment), windowSegment.segment);
          }
          return { completion: Promise.resolve() };
        } finally {
          activeEncodes -= 1;
        }
      },
      async cancel() {
        return;
      },
    });

    const sessionAGeneration = ensureHlsSegmentForRequest({
      sessionId,
      userId: "user-1",
      segment: "segment-00010.ts",
    });
    await waitFor(() => sessionAEncodeStarted);

    const sessionBGeneration = ensureHlsSegmentForRequest({
      sessionId: sessionB,
      userId: "user-1",
      segment: "segment-00030.ts",
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(sessionBEncodeStarted).toBe(false);

    releaseSessionA?.();
    await sessionAGeneration;
    await sessionBGeneration;
    expect(sessionBEncodeStarted).toBe(true);
    expect(maxConcurrentEncodes).toBe(1);
  });

  test("removes failed partial segments but preserves unrelated shared cache segments when ref_count > 1", async () => {
    const samplePolicy = {
      transcodingEnabled: true,
      playbackPreference: "auto" as const,
      preferredAudioLanguage: null,
      preferredSubtitleLanguage: null,
      hardwareAcceleration: "off" as const,
      hardwareAccelerationRequired: false,
      transcodeQualityPreset: "auto" as const,
      transcodeQuality: transcodeQualityTarget("auto"),
    };
    const sessionB = await createTranscodeSession({ mediaFileId: "file-1", userId: "user-1" });
    await updateTranscodeSessionPipeline(sessionB, "request_driven");
    const artifactDirB = path.join(tempDir, "playback-sessions", sessionB);
    await mkdir(artifactDirB, { recursive: true });
    const playlistPathB = path.join(artifactDirB, "master.m3u8");
    await writeFile(playlistPathB, "#EXTM3U\n");
    await registerTranscodeHlsArtifact({
      sessionId: sessionB,
      mediaFileId: "file-1",
      path: playlistPathB,
      mimeType: "application/vnd.apple.mpegurl",
    });
    await updateTranscodeSessionStatus(sessionB, "running");

    const { encodeArtifactDirectory } = await acquirePlaybackCache({
      sessionId,
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policy: samplePolicy,
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });
    await acquirePlaybackCache({
      sessionId: sessionB,
      mediaFileId: "file-1",
      fileSizeBytes: 100,
      fileMtimeMs: nowMs,
      mode: "transcode",
      policy: samplePolicy,
      segmentFormat: "mpegts",
      audioStreamIndex: null,
    });
    await mkdir(encodeArtifactDirectory, { recursive: true });
    await writeFile(path.join(encodeArtifactDirectory, "segment-00000.ts"), "shared");

    setTranscodeBackendForTests({
      async generateHlsSegmentWindow(input: HlsSegmentWindowTranscodeInput) {
        if (input.sessionId !== sessionB) {
          throw new Error("unexpected session encode");
        }
        await mkdir(input.artifactDirectory, { recursive: true });
        await writeFile(path.join(input.artifactDirectory, "segment-00001.ts"), "partial");
        throw new Error("encode failed");
      },
      async cancel() {
        return;
      },
    });

    await expectRejectsToThrow(
      ensureHlsSegmentForRequest({
        sessionId: sessionB,
        userId: "user-1",
        segment: "segment-00001.ts",
      }),
      "encode failed",
    );

    expect(await stat(path.join(encodeArtifactDirectory, "segment-00000.ts"))).toBeDefined();
    await expect(stat(path.join(encodeArtifactDirectory, "segment-00001.ts"))).rejects.toThrow();
  });
});
