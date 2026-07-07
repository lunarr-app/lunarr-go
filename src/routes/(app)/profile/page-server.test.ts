import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { auth } from "$lib/server/auth";
import { createApiKeyForUserId, listApiKeys } from "$lib/server/auth/api-keys";
import { resetAuthForTests, sessionHeadersFor } from "$lib/server/auth/test/setup";
import { getTranscodePolicy } from "$lib/server/transcoding/policy";
import { getContinueMaxAgeDays } from "$lib/server/media/continue-max-age";
import { getSegmentSkipPreferences } from "$lib/server/playback/segment-skip-preferences";

const testUser = {
  id: "user-1",
  name: "Amina",
  email: "amina@example.com",
  role: "user" as const,
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

describe("profile page server", () => {
  let tempDir: string;
  let load: (
    event: Parameters<(typeof import("./+page.server"))["load"]>[0],
  ) => ReturnType<(typeof import("./+page.server"))["load"]>;
  let actions: (typeof import("./+page.server"))["actions"];
  let sessionHeaders: Headers;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-profile-page-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    const db = await getDb();
    const now = Date.now();
    await db
      .insertInto("user")
      .values({
        id: testUser.id,
        name: testUser.name,
        email: testUser.email,
        role: testUser.role,
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await resetAuthForTests();
    sessionHeaders = await sessionHeadersFor(testUser);

    const profileRoute = await import("./+page.server");
    load = profileRoute.load;
    actions = profileRoute.actions;
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("loads the signed-in user's playback preference", async () => {
    const data = await load({
      locals: { user: testUser },
      request: new Request("http://localhost/profile", {
        headers: sessionHeaders,
      }),
      url: new URL("http://localhost/profile"),
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
      continueMaxAgeDays: 0,
      segmentSkip: {
        enabled: true,
        automatic: false,
      },
      apiKeys: [],
    });
  });

  test("redirects pairing query params to link-device", async () => {
    await expectRedirect(
      load({
        locals: { user: testUser },
        request: new Request("http://localhost/profile?code=ABCD-1234&name=Living%20room%20TV", {
          headers: sessionHeaders,
        }),
        url: new URL("http://localhost/profile?code=ABCD-1234&name=Living%20room%20TV"),
      } as never),
      "/link-device?code=ABCD-1234&name=Living+room+TV",
    );
  });

  test("loads the signed-in user's API keys", async () => {
    const created = await createApiKeyForUserId({
      userId: "user-1",
      name: "iPhone",
      expiresIn: 60,
    });

    const data = await load({
      locals: { user: testUser },
      request: new Request("http://localhost/profile", {
        headers: sessionHeaders,
      }),
      url: new URL("http://localhost/profile"),
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

    await expectRedirect(
      actions.savePlaybackPreference({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/profile",
    );

    expect(await getTranscodePolicy("user-1").then((policy) => policy.playbackPreference)).toBe("prefer_transcode");
    expect(await getTranscodePolicy("user-1").then((policy) => policy.preferredAudioLanguage)).toBe("jpn");
    expect(await getTranscodePolicy("user-1").then((policy) => policy.preferredSubtitleLanguage)).toBe("eng");
  });

  test("saves segment skip preferences for normal users", async () => {
    const form = new FormData();
    form.set("segmentSkipEnabled", "1");
    form.set("segmentSkipAutomatic", "1");

    await expectRedirect(
      actions.saveSegmentSkip({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/profile",
    );

    expect(await getSegmentSkipPreferences("user-1")).toEqual({
      enabled: true,
      automatic: true,
    });
  });

  test("disables segment skip when the switch is off", async () => {
    const form = new FormData();
    form.set("segmentSkipAutomatic", "0");

    await expectRedirect(
      actions.saveSegmentSkip({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/profile",
    );

    expect(await getSegmentSkipPreferences("user-1")).toEqual({
      enabled: false,
      automatic: false,
    });
  });

  test("rejects segment skip writes without a user", async () => {
    const form = new FormData();
    form.set("segmentSkipEnabled", "1");

    const result = await actions.saveSegmentSkip({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
      }),
      locals: { user: null },
    } as never);

    expect(result).toMatchObject({
      status: 401,
      data: {
        segmentSkipError: "Sign in to update skip settings.",
      },
    });
  });

  test("saves continue max age for normal users", async () => {
    const form = new FormData();
    form.set("continueMaxAgeDays", "90");

    await expectRedirect(
      actions.saveContinueMaxAge({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/profile",
    );

    expect(await getContinueMaxAgeDays("user-1")).toBe(90);
  });

  test("normalizes invalid continue max age values", async () => {
    const form = new FormData();
    form.set("continueMaxAgeDays", "not-a-number");

    await expectRedirect(
      actions.saveContinueMaxAge({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/profile",
    );

    expect(await getContinueMaxAgeDays("user-1")).toBe(0);
  });

  test("rejects continue max age writes without a user", async () => {
    const form = new FormData();
    form.set("continueMaxAgeDays", "30");

    const result = await actions.saveContinueMaxAge({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
      }),
      locals: { user: null },
    } as never);

    expect(result).toMatchObject({
      status: 401,
      data: {
        continueMaxAgeError: "Sign in to update continue settings.",
      },
    });
  });

  test("normalizes invalid playback preference values", async () => {
    const form = new FormData();
    form.set("playbackPreference", "always_transcode");

    await expectRedirect(
      actions.savePlaybackPreference({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/profile",
    );

    expect(await getTranscodePolicy("user-1").then((policy) => policy.playbackPreference)).toBe("auto");
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
        headers: sessionHeaders,
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(result).toMatchObject({
      apiKeySuccess: "API key created. Copy it now. It will not be shown again.",
      createdApiKey: {
        name: "Android phone",
        expiresAt: expect.any(String),
      },
      createdApiKeyToken: expect.stringMatching(/^lunarr_/),
    });

    expect(await listApiKeys(sessionHeaders)).toHaveLength(1);
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
        headers: sessionHeaders,
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
        headers: sessionHeaders,
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

  test("rejects custom expiration without a value", async () => {
    const form = new FormData();
    form.set("name", "Bad key");
    form.set("expiresPreset", "custom");
    form.set("expiresIn", "   ");

    const result = await actions.createApiKey({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
        headers: sessionHeaders,
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
    const created = await createApiKeyForUserId({
      userId: "user-1",
      name: "Tablet",
    });
    const form = new FormData();
    form.set("apiKeyId", created.apiKey.id);

    await expectRedirect(
      actions.revokeApiKey({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
          headers: sessionHeaders,
        }),
        locals: { user: { id: "user-1", role: "user" } },
      } as never),
      "/profile",
    );

    expect(await listApiKeys(sessionHeaders)).toEqual([]);
  });

  test("updates account name through auth", async () => {
    const form = new FormData();
    form.set("name", "Amina Khan");

    await expectRedirect(
      actions.updateAccount({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
          headers: sessionHeaders,
        }),
        locals: {
          user: {
            id: "user-1",
            name: "Amina",
            email: "amina@example.com",
            role: "user",
          },
        },
      } as never),
      "/profile",
    );

    const db = await getDb();
    const user = await db.selectFrom("user").select(["name"]).where("id", "=", "user-1").executeTakeFirstOrThrow();
    expect(user.name).toBe("Amina Khan");
  });

  test("rejects empty account names", async () => {
    const form = new FormData();
    form.set("name", "   ");

    const result = await actions.updateAccount({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
      }),
      locals: {
        user: {
          id: "user-1",
          name: "Amina",
          email: "amina@example.com",
          role: "user",
        },
      },
    } as never);

    expect(result).toMatchObject({
      status: 400,
      data: {
        name: "",
        accountError: "Name is required.",
      },
    });
  });

  test("rejects account updates without a user", async () => {
    const form = new FormData();
    form.set("name", "Amina Khan");

    const result = await actions.updateAccount({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
      }),
      locals: { user: null },
    } as never);

    expect(result).toMatchObject({
      status: 401,
      data: {
        accountError: "Sign in to update your account.",
      },
    });
  });

  test("changes password through auth", async () => {
    const form = new FormData();
    form.set("currentPassword", "password123");
    form.set("newPassword", "new-password");
    form.set("confirmPassword", "new-password");

    await expectRedirect(
      actions.changePassword({
        request: new Request("http://localhost/profile", {
          method: "POST",
          body: form,
          headers: sessionHeaders,
        }),
        locals: {
          user: {
            id: "user-1",
            name: "Amina",
            email: "amina@example.com",
            role: "user",
          },
        },
      } as never),
      "/profile",
    );

    expect(
      await auth.api.signInEmail({
        body: {
          email: "amina@example.com",
          password: "new-password",
        },
      }),
    ).toBeDefined();
  });

  test("rejects mismatched new passwords", async () => {
    const form = new FormData();
    form.set("currentPassword", "old-password");
    form.set("newPassword", "new-password");
    form.set("confirmPassword", "different-password");

    const result = await actions.changePassword({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
      }),
      locals: {
        user: {
          id: "user-1",
          name: "Amina",
          email: "amina@example.com",
          role: "user",
        },
      },
    } as never);

    expect(result).toMatchObject({
      status: 400,
      data: {
        passwordError: "New passwords do not match.",
      },
    });
  });

  test("rejects short new passwords", async () => {
    const form = new FormData();
    form.set("currentPassword", "old-password");
    form.set("newPassword", "short");
    form.set("confirmPassword", "short");

    const result = await actions.changePassword({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
      }),
      locals: {
        user: {
          id: "user-1",
          name: "Amina",
          email: "amina@example.com",
          role: "user",
        },
      },
    } as never);

    expect(result).toMatchObject({
      status: 400,
      data: {
        passwordError: "New password must be at least 8 characters.",
      },
    });
  });

  test("rejects password changes without a user", async () => {
    const form = new FormData();
    form.set("currentPassword", "old-password");
    form.set("newPassword", "new-password");
    form.set("confirmPassword", "new-password");

    const result = await actions.changePassword({
      request: new Request("http://localhost/profile", {
        method: "POST",
        body: form,
      }),
      locals: { user: null },
    } as never);

    expect(result).toMatchObject({
      status: 401,
      data: {
        passwordError: "Sign in to change your password.",
      },
    });
  });
});
