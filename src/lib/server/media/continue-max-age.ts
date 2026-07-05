import { sql, type RawBuilder } from "kysely";
import { appEnv } from "$lib/server/config/env";

export const MIN_CONTINUE_POSITION_SECONDS = 60;

let testContinueMaxAgeDays: number | undefined;

export function setContinueMaxAgeDaysForTests(days: number | undefined) {
  testContinueMaxAgeDays = days;
}

function continueMaxAgeDays(): number {
  return testContinueMaxAgeDays ?? appEnv.LUNARR_CONTINUE_MAX_AGE_DAYS;
}

export function continueMaxAgeEnabled(): boolean {
  return continueMaxAgeDays() > 0;
}

export function isContinueProgressFresh(updatedAt: string, now = new Date()): boolean {
  if (!continueMaxAgeEnabled()) return true;

  const cutoffMs = now.getTime() - continueMaxAgeDays() * 24 * 60 * 60 * 1000;
  return new Date(updatedAt).getTime() > cutoffMs;
}

export function continueMaxAgeCutoffSql(): RawBuilder<string> {
  const maxAgeDays = continueMaxAgeDays();
  return sql<string>`datetime('now', ${`-${maxAgeDays} days`})`;
}
