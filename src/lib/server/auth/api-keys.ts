import {
  API_KEY_MAX_EXPIRES_IN_DAYS,
  API_KEY_MAX_EXPIRES_IN_SECONDS,
  API_KEY_MAX_NAME_LENGTH,
} from "./api-key-config";

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

function isoDate(value: Date | number | string | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

function toApiKeySummary(row: BetterAuthApiKeyRecord): ApiKeySummary {
  return {
    id: row.id,
    name: row.name ?? "Mobile app",
    tokenPrefix: row.start ?? "",
    lastUsedAt: isoDate(row.lastRequest ?? null),
    expiresAt: isoDate(row.expiresAt ?? null),
    createdAt: isoDate(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: isoDate(row.updatedAt) ?? new Date(0).toISOString(),
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
    throw new Error(
      `Expiration cannot be more than ${API_KEY_MAX_EXPIRES_IN_DAYS} days.`,
    );
  }
  return seconds;
}

function mapAuthError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String(error.message));
  }
  return new Error(fallback);
}

async function getAuth() {
  const { auth } = await import("./index");
  return auth;
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if (
    "status" in error &&
    (error.status === 404 || error.status === "NOT_FOUND")
  ) {
    return true;
  }
  if ("message" in error) {
    const message = String(error.message).toLowerCase();
    return message.includes("not found") || message.includes("key_not_found");
  }
  return false;
}

export async function createApiKey(input: {
  name?: unknown;
  expiresIn?: unknown;
  headers?: Headers;
  userId?: string;
}) {
  const name = normalizeApiKeyName(input.name);
  const expiresIn = normalizeExpiresIn(input.expiresIn);

  if (!input.headers && !input.userId) {
    throw new Error("Sign in to create API keys.");
  }

  try {
    const auth = await getAuth();
    const created = await auth.api.createApiKey({
      body: input.headers
        ? {
            name,
            ...(expiresIn != null ? { expiresIn } : {}),
          }
        : {
            name,
            userId: input.userId!,
            ...(expiresIn != null ? { expiresIn } : {}),
          },
      ...(input.headers ? { headers: input.headers } : {}),
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
    const auth = await getAuth();
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

export async function revokeApiKey(input: {
  headers: Headers;
  apiKeyId: string;
}) {
  try {
    const auth = await getAuth();
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
