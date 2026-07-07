import { describe, expect, test } from "bun:test";
import { createSlidingWindowRateLimiter } from "./sliding-window-rate-limit";

describe("createSlidingWindowRateLimiter", () => {
  test("allows requests under the limit", () => {
    const limiter = createSlidingWindowRateLimiter({ windowMs: 60_000 });
    expect(limiter.isLimited("client", 2, 1_000)).toBe(false);
    expect(limiter.isLimited("client", 2, 2_000)).toBe(false);
    expect(limiter.isLimited("client", 2, 3_000)).toBe(true);
  });

  test("tracks keys independently", () => {
    const limiter = createSlidingWindowRateLimiter({ windowMs: 60_000 });
    expect(limiter.isLimited("a", 1, 1_000)).toBe(false);
    expect(limiter.isLimited("a", 1, 2_000)).toBe(true);
    expect(limiter.isLimited("b", 1, 2_000)).toBe(false);
  });

  test("expires timestamps outside the window", () => {
    const limiter = createSlidingWindowRateLimiter({ windowMs: 1_000 });
    expect(limiter.isLimited("client", 1, 1_000)).toBe(false);
    expect(limiter.isLimited("client", 1, 1_500)).toBe(true);
    expect(limiter.isLimited("client", 1, 2_100)).toBe(false);
  });
});
