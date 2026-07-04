import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DEVICE_PAIRING_API_KEY_EXPIRES_IN_SECONDS } from "$lib/device-pairing/constants";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "$lib/server/db";
import { resetAuthForTests } from "$lib/server/auth/test/setup";
import { resetDevicePairingRateLimitsForTests } from "$lib/server/auth/device-pairing-rate-limit";
import { POST as startPost } from "./+server";
import { GET as pollGet } from "./poll/+server";
import { POST as approvePost } from "./approve/+server";

describe("device pairing API", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-device-pairing-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    await resetAuthForTests();
    resetDevicePairingRateLimitsForTests();

    const db = await getDb();
    const now = Date.now();
    await db
      .insertInto("user")
      .values({
        id: "user-1",
        name: "User",
        email: "user@example.com",
        role: "user",
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
  });

  afterAll(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("starts pairing, approves from a signed-in user, and returns the API key once", async () => {
    const startResponse = await startPost({
      request: new Request("http://localhost/api/device-pairing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceName: "Living room TV" }),
      }),
      locals: { user: null },
      getClientAddress: () => "127.0.0.1",
    } as never);

    expect(startResponse.status).toBe(201);
    const started = await startResponse.json();
    expect(started.deviceCode).toBeTruthy();
    expect(started.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const pendingResponse = await pollGet({
      url: new URL(`http://localhost/api/device-pairing/poll?deviceCode=${encodeURIComponent(started.deviceCode)}`),
      locals: { user: null },
      getClientAddress: () => "127.0.0.1",
    } as never);
    expect(pendingResponse.status).toBe(200);
    expect(await pendingResponse.json()).toMatchObject({ status: "pending" });

    const approveResponse = await approvePost({
      request: new Request("http://localhost/api/device-pairing/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userCode: started.userCode, deviceName: "Living room TV" }),
      }),
      locals: { user: { id: "user-1", role: "user", name: "User", email: "user@example.com" } },
      getClientAddress: () => "127.0.0.2",
    } as never);
    expect(approveResponse.status).toBe(200);
    const approved = await approveResponse.json();
    expect(approved.ok).toBe(true);
    expect(approved.deviceName).toBe("Living room TV");
    const before = Date.now();
    expect(approved.apiKey.expiresAt).toBeTruthy();
    const approvedExpiresAt = Date.parse(approved.apiKey.expiresAt);
    expect(approvedExpiresAt).toBeGreaterThanOrEqual(before + DEVICE_PAIRING_API_KEY_EXPIRES_IN_SECONDS * 1000 - 5000);

    const db = await getDb();
    const apiKeyRow = await db
      .selectFrom("apikey")
      .select(["expires_at"])
      .where("id", "=", approved.apiKey.id)
      .executeTakeFirstOrThrow();
    expect(approved.apiKey.expiresAt).toBe(new Date(String(apiKeyRow.expires_at)).toISOString());

    const completedResponse = await pollGet({
      url: new URL(`http://localhost/api/device-pairing/poll?deviceCode=${encodeURIComponent(started.deviceCode)}`),
      locals: { user: null },
      getClientAddress: () => "127.0.0.1",
    } as never);
    expect(completedResponse.status).toBe(200);
    const completed = await completedResponse.json();
    expect(completed.status).toBe("approved");
    expect(completed.apiKey).toMatch(/^lunarr_/);
    expect(completed.name).toBe("Living room TV");

    const consumedResponse = await pollGet({
      url: new URL(`http://localhost/api/device-pairing/poll?deviceCode=${encodeURIComponent(started.deviceCode)}`),
      locals: { user: null },
      getClientAddress: () => "127.0.0.1",
    } as never);
    expect(consumedResponse.status).toBe(410);
  });

  test("delivers the API key after approval even when the pairing window has passed", async () => {
    const startResponse = await startPost({
      request: new Request("http://localhost/api/device-pairing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceName: "Bedroom TV" }),
      }),
      locals: { user: null },
      getClientAddress: () => "127.0.0.4",
    } as never);
    const started = await startResponse.json();

    const approveResponse = await approvePost({
      request: new Request("http://localhost/api/device-pairing/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userCode: started.userCode, deviceName: "Bedroom TV" }),
      }),
      locals: { user: { id: "user-1", role: "user", name: "User", email: "user@example.com" } },
      getClientAddress: () => "127.0.0.5",
    } as never);
    expect(approveResponse.status).toBe(200);

    const db = await getDb();
    await db
      .updateTable("device_pairing")
      .set({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .where("device_code", "=", started.deviceCode)
      .execute();

    const completedResponse = await pollGet({
      url: new URL(`http://localhost/api/device-pairing/poll?deviceCode=${encodeURIComponent(started.deviceCode)}`),
      locals: { user: null },
      getClientAddress: () => "127.0.0.4",
    } as never);
    expect(completedResponse.status).toBe(200);
    expect(await completedResponse.json()).toMatchObject({
      status: "approved",
      name: "Bedroom TV",
    });
  });

  test("rejects concurrent approve requests for the same pairing code", async () => {
    const startResponse = await startPost({
      request: new Request("http://localhost/api/device-pairing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceName: "Office TV" }),
      }),
      locals: { user: null },
      getClientAddress: () => "127.0.0.6",
    } as never);
    const started = await startResponse.json();

    const approveRequest = () =>
      approvePost({
        request: new Request("http://localhost/api/device-pairing/approve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userCode: started.userCode, deviceName: "Office TV" }),
        }),
        locals: { user: { id: "user-1", role: "user", name: "User", email: "user@example.com" } },
        getClientAddress: () => "127.0.0.7",
      } as never);

    const [first, second] = await Promise.all([approveRequest(), approveRequest()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    const db = await getDb();
    const pairing = await db
      .selectFrom("device_pairing")
      .select(["api_key_id"])
      .where("device_code", "=", started.deviceCode)
      .executeTakeFirstOrThrow();
    expect(pairing.api_key_id).toBeTruthy();

    const apiKeys = await db
      .selectFrom("apikey")
      .select(["id"])
      .where("reference_id", "=", "user-1")
      .where("name", "=", "Office TV")
      .execute();
    expect(apiKeys).toHaveLength(1);
  });

  test("requires authentication to approve", async () => {
    const response = await approvePost({
      request: new Request("http://localhost/api/device-pairing/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userCode: "ABCD1234" }),
      }),
      locals: { user: null },
      getClientAddress: () => "127.0.0.3",
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
