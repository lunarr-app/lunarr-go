import { createTtlCache } from "./ttl-cache";

export type SlidingWindowRateLimiter = {
  isLimited(key: string, limit: number, now?: number): boolean;
  clear(): void;
};

export type SlidingWindowRateLimiterOptions = {
  windowMs: number;
  maxKeys?: number;
};

export function createSlidingWindowRateLimiter(options: SlidingWindowRateLimiterOptions): SlidingWindowRateLimiter {
  const windowMs = Math.max(1, options.windowMs);
  const cache = createTtlCache<number[]>({
    ttlMs: windowMs,
    maxEntries: options.maxKeys ?? 10_000,
  });

  function prune(timestamps: number[], now: number) {
    const cutoff = now - windowMs;
    return timestamps.filter((timestamp) => timestamp >= cutoff);
  }

  return {
    isLimited(key, limit, now = Date.now()) {
      const timestamps = prune(cache.get(key) ?? [], now);
      if (timestamps.length >= limit) {
        cache.set(key, timestamps);
        return true;
      }
      timestamps.push(now);
      cache.set(key, timestamps);
      return false;
    },
    clear() {
      cache.clear();
    },
  };
}
