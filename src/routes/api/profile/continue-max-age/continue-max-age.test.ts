import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { getContinueMaxAgeDays, setUserContinueMaxAgeDays } from "$lib/server/media/continue-max-age";
import { PUT } from "./+server";

describe("profile continue max age API", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-continue-max-age-api-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    await setUserContinueMaxAgeDays("user-2", 120);
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("updates continue max age for the signed-in user only", async () => {
    const response = await PUT({
      request: new Request("http://localhost/api/profile/continue-max-age", {
        method: "PUT",
        body: JSON.stringify({ continueMaxAgeDays: 90 }),
        headers: { "content-type": "application/json" },
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(await getContinueMaxAgeDays("user-1")).toBe(90);
    expect(await getContinueMaxAgeDays("user-2")).toBe(120);
  });

  test("normalizes out-of-range values", async () => {
    const response = await PUT({
      request: new Request("http://localhost/api/profile/continue-max-age", {
        method: "PUT",
        body: JSON.stringify({ continueMaxAgeDays: 9999 }),
        headers: { "content-type": "application/json" },
      }),
      locals: { user: { id: "user-1", role: "user" } },
    } as never);

    expect(response.status).toBe(200);
    expect(await getContinueMaxAgeDays("user-1")).toBe(3650);
  });
});
