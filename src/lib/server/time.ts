export function nowIso() {
  return new Date().toISOString();
}

export function toIsoDate(value: Date | number | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

/** Maximum delay for Node setTimeout (~24.8 days). Longer waits are rescheduled on the next sync. */
export const MAX_SCHEDULED_TIMEOUT_MS = 2_147_483_647;
