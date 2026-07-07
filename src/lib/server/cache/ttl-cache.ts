export type TtlCacheOptions = {
  ttlMs: number;
  maxEntries?: number;
};

export type TtlCache<T> = {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
};

type TtlCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export function createTtlCache<T>(options: TtlCacheOptions): TtlCache<T> {
  const store = new Map<string, TtlCacheEntry<T>>();
  const ttlMs = Math.max(1, options.ttlMs);
  const maxEntries = Math.max(1, options.maxEntries ?? Number.POSITIVE_INFINITY);

  function isExpired(entry: TtlCacheEntry<T>, now = Date.now()) {
    return now >= entry.expiresAt;
  }

  function touch(key: string, entry: TtlCacheEntry<T>) {
    store.delete(key);
    store.set(key, entry);
  }

  function evictExpired(now = Date.now()) {
    for (const [key, entry] of store) {
      if (isExpired(entry, now)) store.delete(key);
    }
  }

  function evictOldestWhileOverLimit() {
    while (store.size >= maxEntries) {
      const oldestKey = store.keys().next().value;
      if (oldestKey === undefined) break;
      store.delete(oldestKey);
    }
  }

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (isExpired(entry)) {
        store.delete(key);
        return undefined;
      }
      touch(key, entry);
      return entry.value;
    },
    set(key, value) {
      const entry: TtlCacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
      if (store.has(key)) {
        touch(key, entry);
        return;
      }
      evictExpired();
      evictOldestWhileOverLimit();
      store.set(key, entry);
    },
    delete(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    size() {
      evictExpired();
      return store.size;
    },
  };
}
