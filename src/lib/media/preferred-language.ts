export function normalizePreferredLanguage(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized.slice(0, 32) : null;
}
