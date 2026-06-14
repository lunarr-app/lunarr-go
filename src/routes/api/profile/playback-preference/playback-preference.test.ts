import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import {
  getTranscodePolicy,
  setUserPlaybackPreference,
  setUserPreferredAudioLanguage,
  setUserPreferredSubtitleLanguage,
} from "$lib/server/transcoding/policy";
import { PUT } from "./+server";

describe("profile playback preference API", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-playback-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    await setUserPlaybackPreference("user-1", "prefer_direct");
    await setUserPreferredAudioLanguage("user-1", "jpn");
    await setUserPreferredSubtitleLanguage("user-1", "eng");
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("preserves saved languages when old clients update only playback preference", async () => {
    const response = await PUT({
      request: new Request("http://localhost/api/profile/playback-preference", {
        method: "PUT",
        body: JSON.stringify({ playbackPreference: "prefer_transcode" }),
        headers: { "content-type": "application/json" },
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    await expect(getTranscodePolicy("user-1")).resolves.toMatchObject({
      playbackPreference: "prefer_transcode",
      preferredAudioLanguage: "jpn",
      preferredSubtitleLanguage: "eng",
    });
  });

  test("preserves playback preference and omitted subtitle language for language-only updates", async () => {
    const response = await PUT({
      request: new Request("http://localhost/api/profile/playback-preference", {
        method: "PUT",
        body: JSON.stringify({ preferredAudioLanguage: " fra " }),
        headers: { "content-type": "application/json" },
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    await expect(getTranscodePolicy("user-1")).resolves.toMatchObject({
      playbackPreference: "prefer_direct",
      preferredAudioLanguage: "fra",
      preferredSubtitleLanguage: "eng",
    });
  });

  test("clears a language when the field is explicitly sent empty", async () => {
    const response = await PUT({
      request: new Request("http://localhost/api/profile/playback-preference", {
        method: "PUT",
        body: JSON.stringify({ preferredSubtitleLanguage: "" }),
        headers: { "content-type": "application/json" },
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    await expect(getTranscodePolicy("user-1")).resolves.toMatchObject({
      playbackPreference: "prefer_direct",
      preferredAudioLanguage: "jpn",
      preferredSubtitleLanguage: null,
    });
  });
});
