import { SHARE_RATE_LIMIT_PLAYBACK_PER_MINUTE, SHARE_RATE_LIMIT_RESOLVE_PER_MINUTE } from "$lib/shares/constants";
import { createSlidingWindowRateLimiter } from "$lib/server/cache/sliding-window-rate-limit";
import type { RequestEvent } from "@sveltejs/kit";

export type GuestShareRateLimitBucket = "share:resolve" | "share:playback";

const WINDOW_MS = 60_000;

let testLimitOverrides: Partial<Record<GuestShareRateLimitBucket, number>> | null = null;

const bucketLimits: Record<GuestShareRateLimitBucket, number> = {
  "share:resolve": SHARE_RATE_LIMIT_RESOLVE_PER_MINUTE,
  "share:playback": SHARE_RATE_LIMIT_PLAYBACK_PER_MINUTE,
};

const requestLimiter = createSlidingWindowRateLimiter({ windowMs: WINDOW_MS });

function limitForBucket(bucket: GuestShareRateLimitBucket) {
  return testLimitOverrides?.[bucket] ?? bucketLimits[bucket];
}

export function resetGuestShareRateLimitsForTests() {
  requestLimiter.clear();
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
  if (!requestLimiter.isLimited(key, limitForBucket(bucket))) {
    return null;
  }
  return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), {
    status: 429,
    headers: { "content-type": "application/json" },
  });
}
