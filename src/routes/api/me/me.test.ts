import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { setUserContinueMaxAgeDays } from "$lib/server/media/continue-max-age";
import { setUserPlaybackPreference } from "$lib/server/transcoding/policy";
import { GET } from "./+server";

describe("GET /api/me", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-me-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    await setUserPlaybackPreference("user-1", "prefer_direct");
    await setUserContinueMaxAgeDays("user-1", 90);
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns continue max age with transcode policy", async () => {
    const response = await GET({
      locals: {
        user: {
          id: "user-1",
          name: "Amina",
          email: "amina@example.com",
          role: "user",
        },
      },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: {
        id: "user-1",
        name: "Amina",
        email: "amina@example.com",
        role: "user",
      },
      continueMaxAgeDays: 90,
      transcodePolicy: {
        playbackPreference: "prefer_direct",
      },
    });
  });
});
