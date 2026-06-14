import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  closeDatabaseForTests,
  getDb,
  migrateDatabase,
  useDatabaseFileForTests,
} from "$lib/server/db";
import { createApiKey, listApiKeys } from "$lib/server/auth/api-keys";
import { getTranscodePolicy } from "$lib/server/transcoding/policy";
import { actions, load } from "./+page.server";

describe("profile page server", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-profile-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    const db = await getDb();
    const now = Date.now();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "Amina",
        email: "amina@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
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
      apiKeys: [],
    });
  });

  test("loads the signed-in user's API keys", async () => {
    const created = await createApiKey({
      userId: "user-1",
      name: "iPhone",
      expiresIn: 60,
    });

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
      apiKeys: [
        {
          ...created.apiKey,
          tokenPrefix: created.token.slice(0, 18),
        },
      ],
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

  test("creates an API key from profile", async () => {
    const form = new FormData();
    form.set("name", "Android phone");
    form.set("expiresPreset", "2592000");

    const result = await actions.createApiKey({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(result).toMatchObject({
      apiKeySuccess: "API key created. Copy it now; it will not be shown again.",
      createdApiKey: {
        name: "Android phone",
        expiresAt: expect.any(String),
      },
      createdApiKeyToken: expect.stringMatching(/^lunarr_/),
    });

    expect(await listApiKeys("user-1")).toHaveLength(1);
  });

  test("creates an API key with custom expiration seconds", async () => {
    const form = new FormData();
    form.set("name", "Script");
    form.set("expiresPreset", "custom");
    form.set("expiresIn", "60");

    const result = await actions.createApiKey({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(result).toMatchObject({
      createdApiKey: {
        name: "Script",
        expiresAt: expect.any(String),
      },
    });
  });

  test("reports invalid API key expiration values", async () => {
    const form = new FormData();
    form.set("name", "Bad key");
    form.set("expiresPreset", "custom");
    form.set("expiresIn", "not-a-number");

    const result = await actions.createApiKey({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(result).toMatchObject({
      status: 400,
      data: {
        apiKeyError: "Expiration must be a positive number of seconds.",
      },
    });
  });

  test("revokes an API key from profile", async () => {
    const created = await createApiKey({
      userId: "user-1",
      name: "Tablet",
    });
    const form = new FormData();
    form.set("apiKeyId", created.apiKey.id);

    try {
      await actions.revokeApiKey({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never);
      throw new Error("Expected API key revoke to redirect.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 303,
        location: "/profile",
      });
    }

    expect(await listApiKeys("user-1")).toEqual([]);
  });
});
