import { randomBytes } from "node:crypto";
import { defaultKeyHasher } from "@better-auth/api-key";
import { getDb } from "../db";
import { createId } from "../id";
import {
  API_KEY_DISPLAY_PREFIX_LENGTH,
  API_KEY_MAX_EXPIRES_IN_DAYS,
  API_KEY_MAX_EXPIRES_IN_SECONDS,
  API_KEY_MAX_NAME_LENGTH,
  API_KEY_PREFIX,
} from "./api-key-config";

const TOKEN_RANDOM_BYTES = 48;

export type ApiKeySummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function normalizeApiKeyName(name: unknown) {
  const value = typeof name === "string" ? name.trim() : "";
  if (!value) return "Mobile app";
  return value.slice(0, API_KEY_MAX_NAME_LENGTH);
}

function isoDate(value: Date | number | string | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

function normalizeExpiresIn(expiresIn: unknown) {
  if (expiresIn == null || expiresIn === "") return null;
  const seconds = typeof expiresIn === "number" ? expiresIn : Number(expiresIn);

  if (!Number.isFinite(seconds) || !Number.isInteger(seconds) || seconds < 1) {
    throw new Error("Expiration must be a positive number of seconds.");
  }
  if (seconds > API_KEY_MAX_EXPIRES_IN_SECONDS) {
    throw new Error(`Expiration cannot be more than ${API_KEY_MAX_EXPIRES_IN_DAYS} days.`);
  }
  return seconds;
}

function tokenDisplayPrefix(token: string) {
  return token.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH);
}

function publicApiKey(row: {
  id: string;
  name: string | null;
  start: string | null;
  last_request: Date | number | string | null;
  expires_at: Date | number | string | null;
  created_at: Date | number | string;
  updated_at: Date | number | string;
}): ApiKeySummary {
  return {
    id: row.id,
    name: row.name ?? "Mobile app",
    tokenPrefix: row.start ?? "",
    lastUsedAt: isoDate(row.last_request),
    expiresAt: isoDate(row.expires_at),
    createdAt: isoDate(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: isoDate(row.updated_at) ?? new Date(0).toISOString(),
  };
}

export async function createApiKey(input: {
  userId: string;
  name?: unknown;
  expiresIn?: unknown;
}) {
  const db = await getDb();
  const token = `${API_KEY_PREFIX}${randomBytes(TOKEN_RANDOM_BYTES).toString("base64url")}`;
  const now = Date.now();
  const expiresIn = normalizeExpiresIn(input.expiresIn);
  const row = {
    id: createId(),
    config_id: "default",
    name: normalizeApiKeyName(input.name),
    start: tokenDisplayPrefix(token),
    prefix: API_KEY_PREFIX,
    key: await defaultKeyHasher(token),
    reference_id: input.userId,
    refill_interval: null,
    refill_amount: null,
    last_refill_at: null,
    enabled: 1,
    rate_limit_enabled: 0,
    rate_limit_time_window: null,
    rate_limit_max: null,
    request_count: 0,
    remaining: null,
    last_request: null,
    expires_at: expiresIn ? now + expiresIn * 1000 : null,
    created_at: now,
    updated_at: now,
    permissions: null,
    metadata: null,
  };

  await db.insertInto("apikey").values(row).execute();

  return {
    token,
    apiKey: publicApiKey(row),
  };
}

export async function listApiKeys(userId: string) {
  const db = await getDb();
  const rows = await db
    .selectFrom("apikey")
    .select(["id", "name", "start", "last_request", "expires_at", "created_at", "updated_at"])
    .where("reference_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();

  return rows.map(publicApiKey);
}

export async function revokeApiKey(userId: string, apiKeyId: string) {
  const db = await getDb();
  const result = await db
    .deleteFrom("apikey")
    .where("id", "=", apiKeyId)
    .where("reference_id", "=", userId)
    .executeTakeFirst();

  return Number(result.numDeletedRows ?? 0) > 0;
}
