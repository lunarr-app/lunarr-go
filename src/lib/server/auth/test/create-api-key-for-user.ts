import type { ApiKeySummary } from "../api-keys";

function isoDate(value: Date | number | string | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

/** Creates an API key for a specific user without a session. Test-only helper. */
export async function createApiKeyForUser(input: { userId: string; name?: string; expiresIn?: number }) {
  const { auth } = await import("../index");
  const created = await auth.api.createApiKey({
    body: {
      name: input.name ?? "Mobile app",
      userId: input.userId,
      ...(input.expiresIn != null ? { expiresIn: input.expiresIn } : {}),
    },
  });

  const apiKey: ApiKeySummary = {
    id: created.id,
    name: created.name ?? "Mobile app",
    tokenPrefix: created.start ?? "",
    lastUsedAt: isoDate(created.lastRequest ?? null),
    expiresAt: isoDate(created.expiresAt ?? null),
    createdAt: isoDate(created.createdAt) ?? new Date(0).toISOString(),
    updatedAt: isoDate(created.updatedAt) ?? new Date(0).toISOString(),
  };

  return {
    token: created.key,
    apiKey,
  };
}
