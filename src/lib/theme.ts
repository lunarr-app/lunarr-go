export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "lunarr-theme";

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;
type ThemeRoot = Pick<HTMLElement, "dataset">;

export function normalizeTheme(value: unknown): Theme {
  return value === "light" ? "light" : "dark";
}

function browserStorage(): ThemeStorage | null {
  try {
    return typeof globalThis.localStorage === "undefined"
      ? null
      : globalThis.localStorage;
  } catch {
    return null;
  }
}

function documentRoot(): ThemeRoot | null {
  return typeof document === "undefined" ? null : document.documentElement;
}

export function applyTheme(theme: Theme, root = documentRoot()) {
  if (!root) return;
  root.dataset.theme = theme;
}

export function getStoredTheme(storage = browserStorage()): Theme {
  try {
    return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "dark";
  }
}

export function setStoredTheme(theme: Theme, storage = browserStorage()) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Keep the current page in sync even when localStorage is unavailable.
  }
  applyTheme(theme);
}
