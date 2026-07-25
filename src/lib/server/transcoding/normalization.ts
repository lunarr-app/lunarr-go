export function normalizedStartTimeSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}
