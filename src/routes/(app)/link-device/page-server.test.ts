import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { resetAuthForTests } from "$lib/server/auth/test/setup";
import { expectRejectsToMatchObject } from "$lib/test/async-expect";

const testUser = {
  id: "user-1",
  name: "Amina",
  email: "amina@example.com",
  role: "user" as const,
};

describe("link-device page server", () => {
  let tempDir: string;
  let load: (
    event: Parameters<(typeof import("./+page.server"))["load"]>[0],
  ) => ReturnType<(typeof import("./+page.server"))["load"]>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-link-device-page-"));
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

    const route = await import("./+page.server");
    load = route.load;
  });

  afterEach(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("prefills code and optional name from query params", async () => {
    const data = await load({
      locals: { user: testUser },
      url: new URL("http://localhost/link-device?code=abcd-1234&name=Living%20room%20TV"),
    } as never);

    expect(data).toEqual({
      initialUserCode: "abcd-1234",
      initialDeviceName: "Living room TV",
      devicePairingApiKeyExpiry: { neverExpires: false, label: "2 years" },
    });
  });

  test("requires a signed-in user", async () => {
    await expectRejectsToMatchObject(
      load({
        locals: { user: null },
        url: new URL("http://localhost/link-device"),
      } as never),
      { status: 401 },
    );
  });
});
