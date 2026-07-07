import { describe, expect, test } from "bun:test";
import { createTtlCache } from "./ttl-cache";

describe("createTtlCache", () => {
  test("stores and returns values", () => {
    const cache = createTtlCache<string>({ ttlMs: 60_000 });

    cache.set("a", "alpha");
    expect(cache.get("a")).toBe("alpha");
    expect(cache.size()).toBe(1);
  });

  test("expires entries lazily on read", async () => {
    const cache = createTtlCache<string>({ ttlMs: 5 });
    cache.set("a", "alpha");
    expect(cache.get("a")).toBe("alpha");
    await Bun.sleep(10);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  test("evicts least recently used entries when over maxEntries", () => {
    const cache = createTtlCache<string>({ ttlMs: 60_000, maxEntries: 2 });

    cache.set("a", "alpha");
    cache.set("b", "beta");
    cache.set("c", "gamma");

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("beta");
    expect(cache.get("c")).toBe("gamma");
  });

  test("refreshes recency on get and set", () => {
    const cache = createTtlCache<string>({ ttlMs: 60_000, maxEntries: 2 });

    cache.set("a", "alpha");
    cache.set("b", "beta");
    expect(cache.get("a")).toBe("alpha");
    cache.set("c", "gamma");

    expect(cache.get("a")).toBe("alpha");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("gamma");
  });

  test("updates an existing key without evicting other entries", () => {
    const cache = createTtlCache<string>({ ttlMs: 60_000, maxEntries: 2 });

    cache.set("a", "alpha");
    cache.set("b", "beta");
    cache.set("a", "alpha-2");

    expect(cache.size()).toBe(2);
    expect(cache.get("a")).toBe("alpha-2");
    expect(cache.get("b")).toBe("beta");
  });
});
