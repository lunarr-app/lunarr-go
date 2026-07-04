import { SHARE_RATE_LIMIT_PLAYBACK_PER_MINUTE, SHARE_RATE_LIMIT_RESOLVE_PER_MINUTE } from "$lib/shares/constants";
import type { RequestEvent } from "@sveltejs/kit";

export type GuestShareRateLimitBucket = "share:resolve" | "share:playback";

const WINDOW_MS = 60_000;

let testLimitOverrides: Partial<Record<GuestShareRateLimitBucket, number>> | null = null;

const bucketLimits: Record<GuestShareRateLimitBucket, number> = {
  "share:resolve": SHARE_RATE_LIMIT_RESOLVE_PER_MINUTE,
  "share:playback": SHARE_RATE_LIMIT_PLAYBACK_PER_MINUTE,
};

function limitForBucket(bucket: GuestShareRateLimitBucket) {
  return testLimitOverrides?.[bucket] ?? bucketLimits[bucket];
}

const requestTimestamps = new Map<string, number[]>();

function pruneOldTimestamps(timestamps: number[], now: number) {
  const cutoff = now - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0]! < cutoff) {
    timestamps.shift();
  }
}

function isRateLimited(key: string, limit: number, now = Date.now()) {
  let timestamps = requestTimestamps.get(key);
  if (timestamps) {
    pruneOldTimestamps(timestamps, now);
    if (timestamps.length === 0) {
      requestTimestamps.delete(key);
      timestamps = undefined;
    }
  }

  if (!timestamps) {
    requestTimestamps.set(key, [now]);
    return false;
  }

  if (timestamps.length >= limit) {
    return true;
  }

  timestamps.push(now);
  return false;
}

export function resetGuestShareRateLimitsForTests() {
  requestTimestamps.clear();
  testLimitOverrides = null;
}

export function setGuestShareRateLimitOverridesForTests(
  overrides: Partial<Record<GuestShareRateLimitBucket, number>> | null,
) {
  testLimitOverrides = overrides;
}

export function enforceGuestShareRateLimit(event: RequestEvent, bucket: GuestShareRateLimitBucket): Response | null {
  const clientAddress = event.getClientAddress() || "unknown";
  const key = `${bucket}:${clientAddress}`;
  if (!isRateLimited(key, limitForBucket(bucket))) {
    return null;
  }
  return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), {
    status: 429,
    headers: { "content-type": "application/json" },
  });
}
