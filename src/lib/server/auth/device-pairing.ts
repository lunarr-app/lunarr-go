import {
  DEVICE_PAIRING_POLL_INTERVAL_MS,
  DEVICE_PAIRING_RETENTION_MS,
  DEVICE_PAIRING_TTL_MS,
  DEVICE_PAIRING_USER_CODE_LENGTH,
} from "$lib/device-pairing/constants";
import { buildLinkDeviceUrl } from "$lib/device-pairing/url";
import { formatUserCode, generateUserCode, normalizeUserCode } from "$lib/device-pairing/format";
import { devicePairingApiKeyExpiresInSeconds } from "$lib/server/device-pairing/env";
import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import type { DevicePairingStatus } from "../db/schema/device-pairing";
import { createApiKeyForUserId } from "./api-keys";

export class DevicePairingError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DevicePairingError";
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeDeviceName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  return name.slice(0, 80) || "Linked device";
}

async function expireStalePairings(now = new Date()) {
  const db = await getDb();
  const nowText = now.toISOString();
  await db
    .updateTable("device_pairing")
    .set({ status: "expired" })
    .where("status", "=", "pending")
    .where("expires_at", "<=", nowText)
    .execute();
}

export async function cleanupStaleDevicePairings(options: { retentionMs?: number; now?: number } = {}) {
  const retentionMs = options.retentionMs ?? DEVICE_PAIRING_RETENTION_MS;
  const cutoff = new Date((options.now ?? Date.now()) - retentionMs).toISOString();
  const db = await getDb();

  const terminalResult = await db
    .deleteFrom("device_pairing")
    .where("status", "in", ["consumed", "expired"])
    .where("created_at", "<", cutoff)
    .executeTakeFirst();

  const staleApprovedResult = await db
    .deleteFrom("device_pairing")
    .where("status", "=", "approved")
    .where("approved_at", "is not", null)
    .where("approved_at", "<", cutoff)
    .executeTakeFirst();

  return Number(terminalResult.numDeletedRows ?? 0) + Number(staleApprovedResult.numDeletedRows ?? 0);
}

async function createUniqueUserCode() {
  const db = await getDb();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const userCode = generateUserCode(DEVICE_PAIRING_USER_CODE_LENGTH);
    const existing = await db
      .selectFrom("device_pairing")
      .select("id")
      .where("user_code", "=", userCode)
      .executeTakeFirst();
    if (!existing) return userCode;
  }
  throw new DevicePairingError("Could not create a pairing code. Try again.", 503);
}

function isSqliteUniqueViolation(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("unique constraint failed");
}

export async function startDevicePairing(input: { origin: string; deviceName?: unknown }) {
  await expireStalePairings();

  const db = await getDb();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + DEVICE_PAIRING_TTL_MS).toISOString();
  const rawDeviceName = typeof input.deviceName === "string" ? input.deviceName.trim() : "";
  const deviceName = normalizeDeviceName(input.deviceName);
  const deviceCode = randomUUID();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const userCode = await createUniqueUserCode();

    try {
      await db
        .insertInto("device_pairing")
        .values({
          id: randomUUID(),
          device_code: deviceCode,
          user_code: userCode,
          status: "pending",
          device_name: deviceName,
          approved_by_user_id: null,
          api_key_id: null,
          api_key_token: null,
          expires_at: expiresAt,
          approved_at: null,
          created_at: createdAt,
        })
        .execute();

      const formattedUserCode = formatUserCode(userCode);

      return {
        deviceCode,
        userCode: formattedUserCode,
        expiresAt,
        expiresIn: Math.round(DEVICE_PAIRING_TTL_MS / 1000),
        pollIntervalMs: DEVICE_PAIRING_POLL_INTERVAL_MS,
        pairingUrl: buildLinkDeviceUrl(input.origin, {
          userCode: formattedUserCode,
          deviceName: rawDeviceName || undefined,
        }),
      };
    } catch (error) {
      if (!isSqliteUniqueViolation(error)) throw error;
    }
  }

  throw new DevicePairingError("Could not create a pairing code. Try again.", 503);
}

function pairingExpired(expiresAt: string, now = Date.now()) {
  return Date.parse(expiresAt) <= now;
}

async function markExpired(id: string) {
  const db = await getDb();
  await db.updateTable("device_pairing").set({ status: "expired" }).where("id", "=", id).execute();
}

export async function pollDevicePairing(deviceCode: string) {
  await expireStalePairings();

  const normalizedDeviceCode = deviceCode.trim();
  if (!normalizedDeviceCode) {
    throw new DevicePairingError("Device code is required.", 400);
  }

  const db = await getDb();
  const pairing = await db
    .selectFrom("device_pairing")
    .selectAll()
    .where("device_code", "=", normalizedDeviceCode)
    .executeTakeFirst();

  if (!pairing) {
    throw new DevicePairingError("Pairing request not found.", 404);
  }

  if (pairing.status === "consumed") {
    throw new DevicePairingError("Pairing request already completed.", 410);
  }

  if (pairing.status === "expired") {
    return { status: "expired" as const };
  }

  if (pairing.status === "pending") {
    if (pairingExpired(pairing.expires_at)) {
      await markExpired(pairing.id);
      return { status: "expired" as const };
    }

    return {
      status: "pending" as const,
      expiresAt: pairing.expires_at,
      pollIntervalMs: DEVICE_PAIRING_POLL_INTERVAL_MS,
    };
  }

  if (!pairing.api_key_token || !pairing.api_key_id) {
    return {
      status: "pending" as const,
      expiresAt: pairing.expires_at,
      pollIntervalMs: DEVICE_PAIRING_POLL_INTERVAL_MS,
    };
  }

  const token = pairing.api_key_token;
  await db
    .updateTable("device_pairing")
    .set({
      status: "consumed",
      api_key_token: null,
    })
    .where("id", "=", pairing.id)
    .execute();

  return {
    status: "approved" as const,
    apiKey: token,
    apiKeyId: pairing.api_key_id,
    name: pairing.device_name,
  };
}

export async function approveDevicePairing(input: { userId: string; userCode: unknown; deviceName?: unknown }) {
  await expireStalePairings();

  const normalizedUserCode = normalizeUserCode(String(input.userCode ?? ""));
  if (normalizedUserCode.length !== DEVICE_PAIRING_USER_CODE_LENGTH) {
    throw new DevicePairingError("Enter the 8-character code shown on the device.", 400);
  }

  const db = await getDb();
  const pairing = await db
    .selectFrom("device_pairing")
    .selectAll()
    .where("user_code", "=", normalizedUserCode)
    .executeTakeFirst();

  if (!pairing) {
    throw new DevicePairingError("Pairing code not found.", 404);
  }

  if (pairing.status !== "pending") {
    throw new DevicePairingError("This pairing code is no longer active.", 409);
  }

  if (pairingExpired(pairing.expires_at)) {
    await markExpired(pairing.id);
    throw new DevicePairingError("This pairing code has expired.", 410);
  }

  const deviceName = normalizeDeviceName(input.deviceName ?? pairing.device_name);
  const approvedAt = nowIso();
  const claimResult = await db
    .updateTable("device_pairing")
    .set({
      status: "approved" as DevicePairingStatus,
      device_name: deviceName,
      approved_by_user_id: input.userId,
      approved_at: approvedAt,
    })
    .where("id", "=", pairing.id)
    .where("status", "=", "pending")
    .executeTakeFirst();

  if (Number(claimResult.numUpdatedRows ?? 0) === 0) {
    throw new DevicePairingError("This pairing code is no longer active.", 409);
  }

  let created;
  try {
    const expiresIn = devicePairingApiKeyExpiresInSeconds();
    created = await createApiKeyForUserId({
      userId: input.userId,
      name: deviceName,
      ...(expiresIn != null ? { expiresIn } : {}),
    });
  } catch (error) {
    await db
      .updateTable("device_pairing")
      .set({
        status: "pending",
        device_name: pairing.device_name,
        approved_by_user_id: null,
        approved_at: null,
      })
      .where("id", "=", pairing.id)
      .where("status", "=", "approved")
      .where("api_key_id", "is", null)
      .execute();
    throw error;
  }

  await db
    .updateTable("device_pairing")
    .set({
      api_key_id: created.apiKey.id,
      api_key_token: created.token,
    })
    .where("id", "=", pairing.id)
    .where("status", "=", "approved")
    .execute();

  return {
    ok: true as const,
    userCode: formatUserCode(normalizedUserCode),
    deviceName,
    apiKey: created.apiKey,
  };
}

export function devicePairingHttpStatus(error: unknown) {
  if (error instanceof DevicePairingError) return error.status;
  return 400;
}
