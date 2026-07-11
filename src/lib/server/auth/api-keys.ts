import { API_KEY_MAX_EXPIRES_IN_DAYS, API_KEY_MAX_EXPIRES_IN_SECONDS, API_KEY_MAX_NAME_LENGTH } from "./api-key-config";
import { toIsoDate } from "../time";
import { auth } from "./index";

export type ApiKeySummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type BetterAuthApiKeyRecord = {
  id: string;
  name: string | null;
  start: string | null;
  lastRequest?: Date | string | null;
  expiresAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function toApiKeySummary(row: BetterAuthApiKeyRecord): ApiKeySummary {
  return {
    id: row.id,
    name: row.name ?? "Mobile app",
    tokenPrefix: row.start ?? "",
    lastUsedAt: toIsoDate(row.lastRequest ?? null),
    expiresAt: toIsoDate(row.expiresAt ?? null),
    createdAt: toIsoDate(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoDate(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

function normalizeApiKeyName(name: unknown) {
  const value = typeof name === "string" ? name.trim() : "";
  if (!value) return "Mobile app";
  return value.slice(0, API_KEY_MAX_NAME_LENGTH);
}

function normalizeExpiresIn(expiresIn: unknown) {
  if (expiresIn == null || expiresIn === "") return undefined;
  const seconds = typeof expiresIn === "number" ? expiresIn : Number(expiresIn);

  if (!Number.isFinite(seconds) || !Number.isInteger(seconds) || seconds < 1) {
    throw new Error("Expiration must be a positive number of seconds.");
  }
  if (seconds > API_KEY_MAX_EXPIRES_IN_SECONDS) {
    throw new Error(`Expiration cannot be more than ${API_KEY_MAX_EXPIRES_IN_DAYS} days.`);
  }
  return seconds;
}

function isUnauthorizedError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if ("status" in error && (error.status === 401 || error.status === "UNAUTHORIZED")) {
    return true;
  }
  if ("message" in error) {
    return String(error.message).toLowerCase().includes("unauthorized");
  }
  return false;
}

export class ApiKeyError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiKeyError";
    this.status = status;
  }
}

function mapAuthError(error: unknown, fallback: string) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
  const status = isUnauthorizedError(error) ? 401 : 400;
  return new ApiKeyError(message, status);
}

export function apiKeyHttpStatus(error: unknown) {
  if (error instanceof ApiKeyError) return error.status;
  if (isUnauthorizedError(error)) return 401;
  return 400;
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if ("status" in error && (error.status === 404 || error.status === "NOT_FOUND")) {
    return true;
  }
  if ("message" in error) {
    const message = String(error.message).toLowerCase();
    return message.includes("not found") || message.includes("key_not_found");
  }
  return false;
}

export async function createApiKey(input: { name?: unknown; expiresIn?: unknown; headers: Headers }) {
  const name = normalizeApiKeyName(input.name);
  const expiresIn = normalizeExpiresIn(input.expiresIn);

  try {
    const created = await auth.api.createApiKey({
      body: {
        name,
        ...(expiresIn != null ? { expiresIn } : {}),
      },
      headers: input.headers,
    });

    return {
      token: created.key,
      apiKey: toApiKeySummary(created),
    };
  } catch (error) {
    throw mapAuthError(error, "Could not create API key.");
  }
}

export async function createApiKeyForUserId(input: { userId: string; name?: unknown; expiresIn?: number }) {
  const name = normalizeApiKeyName(input.name);
  const expiresIn = input.expiresIn == null ? undefined : normalizeExpiresIn(input.expiresIn);

  try {
    const created = await auth.api.createApiKey({
      body: {
        name,
        userId: input.userId,
        ...(expiresIn != null ? { expiresIn } : {}),
      },
    });

    return {
      token: created.key,
      apiKey: toApiKeySummary(created),
    };
  } catch (error) {
    throw mapAuthError(error, "Could not create API key.");
  }
}

export async function listApiKeys(headers: Headers) {
  try {
    const result = await auth.api.listApiKeys({
      query: {
        sortBy: "createdAt",
        sortDirection: "desc",
      },
      headers,
    });

    return result.apiKeys.map((apiKey) => toApiKeySummary(apiKey));
  } catch (error) {
    throw mapAuthError(error, "Could not list API keys.");
  }
}

export function isApiKeyUnauthorized(error: unknown) {
  if (error instanceof ApiKeyError) return error.status === 401;
  return isUnauthorizedError(error);
}

export async function revokeApiKey(input: { headers: Headers; apiKeyId: string }) {
  try {
    await auth.api.deleteApiKey({
      body: { keyId: input.apiKeyId },
      headers: input.headers,
    });
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw mapAuthError(error, "Could not revoke API key.");
  }
}
