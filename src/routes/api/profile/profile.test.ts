import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { getContinueMaxAgeDays, setUserContinueMaxAgeDays } from "$lib/server/media/continue-max-age";
import { getSegmentSkipPreferences } from "$lib/server/playback/segment-skip-preferences";
import {
  getTranscodePolicy,
  setUserPlaybackPreference,
  setUserPreferredAudioLanguage,
  setUserPreferredSubtitleLanguage,
} from "$lib/server/transcoding/policy";
import { PATCH } from "./+server";

const testUser = { id: "user-1", role: "user" as const };

function patchProfile(body: unknown) {
  return PATCH({
    request: new Request("http://localhost/api/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    locals: { user: testUser },
  } as never);
}

describe("PATCH /api/profile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-profile-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    await setUserPlaybackPreference("user-1", "prefer_direct");
    await setUserPreferredAudioLanguage("user-1", "jpn");
    await setUserPreferredSubtitleLanguage("user-1", "eng");
    await setUserContinueMaxAgeDays("user-2", 120);
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("rejects an empty preference body", async () => {
    const response = await patchProfile({});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      detail: "At least one preference field is required.",
    });
  });

  test("preserves saved languages when only playback preference is updated", async () => {
    const response = await patchProfile({ playbackPreference: "prefer_transcode" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      transcodePolicy: {
        playbackPreference: "prefer_transcode",
        preferredAudioLanguage: "jpn",
        preferredSubtitleLanguage: "eng",
      },
      continueMaxAgeDays: 0,
      segmentSkip: {
        enabled: true,
        automatic: false,
      },
    });
    expect(await getTranscodePolicy("user-1")).toMatchObject({
      playbackPreference: "prefer_transcode",
      preferredAudioLanguage: "jpn",
      preferredSubtitleLanguage: "eng",
    });
  });

  test("preserves playback preference and omitted subtitle language for language-only updates", async () => {
    const response = await patchProfile({ preferredAudioLanguage: " fra " });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      transcodePolicy: {
        playbackPreference: "prefer_direct",
        preferredAudioLanguage: "fra",
        preferredSubtitleLanguage: "eng",
      },
    });
  });

  test("clears a language when the field is explicitly sent empty", async () => {
    const response = await patchProfile({ preferredSubtitleLanguage: "" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      transcodePolicy: {
        playbackPreference: "prefer_direct",
        preferredAudioLanguage: "jpn",
        preferredSubtitleLanguage: null,
      },
    });
  });

  test("updates continue max age for the signed-in user only", async () => {
    const response = await patchProfile({ continueMaxAgeDays: 90 });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      continueMaxAgeDays: 90,
      transcodePolicy: {
        playbackPreference: "prefer_direct",
      },
    });
    expect(await getContinueMaxAgeDays("user-1")).toBe(90);
    expect(await getContinueMaxAgeDays("user-2")).toBe(120);
  });

  test("normalizes out-of-range continue max age values", async () => {
    const response = await patchProfile({ continueMaxAgeDays: 9999 });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      continueMaxAgeDays: 3650,
    });
    expect(await getContinueMaxAgeDays("user-1")).toBe(3650);
  });

  test("updates playback and continue preferences in one request", async () => {
    const response = await patchProfile({
      playbackPreference: "auto",
      continueMaxAgeDays: 30,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      continueMaxAgeDays: 30,
      transcodePolicy: {
        playbackPreference: "auto",
        preferredAudioLanguage: "jpn",
        preferredSubtitleLanguage: "eng",
      },
    });
  });

  test("updates segment skip preferences", async () => {
    const response = await patchProfile({
      segmentSkipEnabled: false,
      segmentSkipAutomatic: true,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      segmentSkip: {
        enabled: false,
        automatic: true,
      },
    });
    expect(await getSegmentSkipPreferences("user-1")).toEqual({
      enabled: false,
      automatic: true,
    });
  });
});
