import { DEFAULT_SHARE_EXPIRY_SECONDS, MAX_SHARE_EXPIRY_SECONDS } from "$lib/shares/constants";
import type { MediaShareKind } from "../db/schema/shares";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIsoTimestamp(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid ISO timestamp.`);
  }
  return new Date(parsed).toISOString();
}

function parseExpiresAt(body: Record<string, unknown>) {
  if (body.expiresAt !== undefined) {
    const expiresAt = parseIsoTimestamp(body.expiresAt, "expiresAt");
    const maxExpiresAt = Date.now() + MAX_SHARE_EXPIRY_SECONDS * 1000;
    if (Date.parse(expiresAt) > maxExpiresAt) {
      throw new Error(`Share expiry cannot be more than ${MAX_SHARE_EXPIRY_SECONDS / 86400} days from now.`);
    }
    if (Date.parse(expiresAt) <= Date.now()) {
      throw new Error("Share expiry must be in the future.");
    }
    return expiresAt;
  }

  const expiresInSeconds = body.expiresInSeconds === undefined ? DEFAULT_SHARE_EXPIRY_SECONDS : body.expiresInSeconds;
  if (typeof expiresInSeconds !== "number" || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error("expiresInSeconds must be a positive number.");
  }
  if (expiresInSeconds > MAX_SHARE_EXPIRY_SECONDS) {
    throw new Error(`Share expiry cannot be more than ${MAX_SHARE_EXPIRY_SECONDS / 86400} days.`);
  }
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function parseSeasonIds(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new Error("seasonIds must be an array of season ids.");
  }
  const seasonIds = value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`seasonIds[${index}] must be a non-empty string.`);
    }
    return item.trim();
  });
  return seasonIds.length === 0 ? null : [...new Set(seasonIds)];
}

export type CreateShareInput = {
  kind: MediaShareKind;
  mediaItemId: string;
  seasonIds: string[] | null;
  expiresAt: string;
};

export function parseCreateShareInput(body: unknown): CreateShareInput {
  if (!isObject(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  const kind = body.kind;
  if (kind !== "movie" && kind !== "show") {
    throw new Error("kind must be movie or show.");
  }

  const mediaItemId = typeof body.mediaItemId === "string" ? body.mediaItemId.trim() : "";
  if (!mediaItemId) {
    throw new Error("mediaItemId is required.");
  }

  const seasonIds = kind === "movie" ? null : parseSeasonIds(body.seasonIds);
  if (kind === "movie" && body.seasonIds !== undefined && body.seasonIds !== null) {
    throw new Error("seasonIds is only valid for show shares.");
  }

  return {
    kind,
    mediaItemId,
    seasonIds,
    expiresAt: parseExpiresAt(body),
  };
}
