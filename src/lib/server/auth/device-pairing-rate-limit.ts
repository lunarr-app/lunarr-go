import {
  DEVICE_PAIRING_APPROVE_RATE_LIMIT_PER_MINUTE,
  DEVICE_PAIRING_POLL_RATE_LIMIT_PER_MINUTE,
  DEVICE_PAIRING_START_RATE_LIMIT_PER_MINUTE,
} from "$lib/device-pairing/constants";
import { createSlidingWindowRateLimiter } from "$lib/server/cache/sliding-window-rate-limit";
import type { RequestEvent } from "@sveltejs/kit";

export type DevicePairingRateLimitBucket = "device-pairing:start" | "device-pairing:poll" | "device-pairing:approve";

const WINDOW_MS = 60_000;

let testLimitOverrides: Partial<Record<DevicePairingRateLimitBucket, number>> | null = null;

const bucketLimits: Record<DevicePairingRateLimitBucket, number> = {
  "device-pairing:start": DEVICE_PAIRING_START_RATE_LIMIT_PER_MINUTE,
  "device-pairing:poll": DEVICE_PAIRING_POLL_RATE_LIMIT_PER_MINUTE,
  "device-pairing:approve": DEVICE_PAIRING_APPROVE_RATE_LIMIT_PER_MINUTE,
};

const requestLimiter = createSlidingWindowRateLimiter({ windowMs: WINDOW_MS });

function limitForBucket(bucket: DevicePairingRateLimitBucket) {
  return testLimitOverrides?.[bucket] ?? bucketLimits[bucket];
}

export function resetDevicePairingRateLimitsForTests() {
  requestLimiter.clear();
  testLimitOverrides = null;
}

export function setDevicePairingRateLimitOverridesForTests(
  overrides: Partial<Record<DevicePairingRateLimitBucket, number>> | null,
) {
  testLimitOverrides = overrides;
}

export const DEVICE_PAIRING_RATE_LIMIT_MESSAGE = "Too many requests. Try again later.";

export function isDevicePairingRateLimited(clientAddress: string, bucket: DevicePairingRateLimitBucket, scope = "") {
  const key = scope ? `${bucket}:${scope}:${clientAddress}` : `${bucket}:${clientAddress}`;
  return requestLimiter.isLimited(key, limitForBucket(bucket));
}

export function enforceDevicePairingRateLimit(
  event: RequestEvent,
  bucket: DevicePairingRateLimitBucket,
  scope = "",
): Response | null {
  const clientAddress = event.getClientAddress() || "unknown";
  if (!isDevicePairingRateLimited(clientAddress, bucket, scope)) {
    return null;
  }
  return new Response(JSON.stringify({ error: DEVICE_PAIRING_RATE_LIMIT_MESSAGE }), {
    status: 429,
    headers: { "content-type": "application/json" },
  });
}
