import { sql, type RawBuilder } from "kysely";
import { appEnv } from "$lib/server/config/env";

export const MIN_CONTINUE_POSITION_SECONDS = 60;

let testContinueMaxAgeDays: number | undefined;

export function setContinueMaxAgeDaysForTests(days: number | undefined) {
  testContinueMaxAgeDays = days;
}

function continueMaxAgeDays(days?: number): number {
  if (days !== undefined) return days;
  return testContinueMaxAgeDays ?? appEnv.LUNARR_CONTINUE_MAX_AGE_DAYS;
}

export function continueMaxAgeEnabled(days?: number): boolean {
  return continueMaxAgeDays(days) > 0;
}

export function isContinueProgressFresh(updatedAt: string, days?: number, now = new Date()): boolean {
  if (!continueMaxAgeEnabled(days)) return true;

  const cutoffMs = now.getTime() - continueMaxAgeDays(days) * 24 * 60 * 60 * 1000;
  return new Date(updatedAt).getTime() > cutoffMs;
}

export function continueMaxAgeCutoffSql(days?: number): RawBuilder<string> {
  const maxAgeDays = continueMaxAgeDays(days);
  return sql<string>`datetime('now', ${`-${maxAgeDays} days`})`;
}
