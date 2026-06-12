import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  closeDatabaseForTests,
  migrateDatabase,
  useDatabaseFileForTests,
} from "$lib/server/db";
import { getTranscodePolicy } from "$lib/server/transcoding/policy";
import { actions, load } from "./+page.server";

describe("profile page server", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-profile-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("loads the signed-in user's playback preference", async () => {
    const data = await load({
      locals: {
        user: {
          id: "user-1",
          name: "Amina",
          email: "amina@example.com",
          role: "user",
        },
      },
    } as never);

    expect(data).toMatchObject({
      user: {
        id: "user-1",
        name: "Amina",
        email: "amina@example.com",
        role: "user",
      },
      transcodePolicy: {
        playbackPreference: "auto",
        preferredAudioLanguage: null,
        preferredSubtitleLanguage: null,
        transcodingEnabled: true,
      },
    });
  });

  test("saves playback preference for normal users", async () => {
    const form = new FormData();
    form.set("playbackPreference", "prefer_transcode");
    form.set("preferredAudioLanguage", " JPN ");
    form.set("preferredSubtitleLanguage", " ENG ");

    try {
      await actions.savePlaybackPreference({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);
      throw new Error("Expected playback preference save to redirect.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 303,
        location: "/profile",
      });
    }

    expect(
      await getTranscodePolicy("user-1").then(
        (policy) => policy.playbackPreference,
      ),
    ).toBe("prefer_transcode");
    expect(
      await getTranscodePolicy("user-1").then(
        (policy) => policy.preferredAudioLanguage,
      ),
    ).toBe("jpn");
    expect(
      await getTranscodePolicy("user-1").then(
        (policy) => policy.preferredSubtitleLanguage,
      ),
    ).toBe("eng");
  });

  test("normalizes invalid playback preference values", async () => {
    const form = new FormData();
    form.set("playbackPreference", "always_transcode");

    try {
      await actions.savePlaybackPreference({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);
      throw new Error("Expected playback preference save to redirect.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 303,
        location: "/profile",
      });
    }

    expect(
      await getTranscodePolicy("user-1").then(
        (policy) => policy.playbackPreference,
      ),
    ).toBe("auto");
  });

  test("rejects playback preference writes without a user", async () => {
    const form = new FormData();
    form.set("playbackPreference", "prefer_direct");

    const result = await actions.savePlaybackPreference({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
      }),
      locals: { user: null },
    } as never);

    expect(result).toMatchObject({
      status: 401,
      data: {
        playbackPreferenceError: "Sign in to update playback settings.",
      },
    });
  });
});
