export function nowIso() {
  return new Date().toISOString();
}

/** Maximum delay for Node setTimeout (~24.8 days). Longer waits are rescheduled on the next sync. */
export const MAX_SCHEDULED_TIMEOUT_MS = 2_147_483_647;
