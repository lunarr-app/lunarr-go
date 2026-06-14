import { describe, expect, test } from "bun:test";

import { THEME_STORAGE_KEY, applyTheme, getStoredTheme, normalizeTheme, setStoredTheme } from "$lib/theme";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: (key: string) => (key === THEME_STORAGE_KEY ? value : null),
    setItem: (key: string, nextValue: string) => {
      if (key === THEME_STORAGE_KEY) value = nextValue;
    },
  };
}

describe("theme helpers", () => {
  test("normalizes unknown values to dark", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("system")).toBe("dark");
    expect(normalizeTheme(null)).toBe("dark");
  });

  test("reads a stored browser theme", () => {
    expect(getStoredTheme(memoryStorage("light"))).toBe("light");
    expect(getStoredTheme(memoryStorage("system"))).toBe("dark");
  });

  test("applies a theme to a root dataset", () => {
    const root = { dataset: {} } as HTMLElement;

    applyTheme("light", root);

    expect(root.dataset.theme).toBe("light");
  });

  test("stores the selected theme", () => {
    const storage = memoryStorage();

    setStoredTheme("light", storage);

    expect(getStoredTheme(storage)).toBe("light");
  });

  test("falls back when browser storage access is blocked", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage blocked");
      },
    });

    try {
      expect(getStoredTheme()).toBe("dark");
      expect(() => setStoredTheme("light")).not.toThrow();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "localStorage", originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });
});
