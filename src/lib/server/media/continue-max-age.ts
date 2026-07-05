import { sql, type RawBuilder } from "kysely";
import { appEnv } from "$lib/server/config/env";

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

export function continueProgressFreshSql(updatedAtColumn: string, days?: number): RawBuilder<boolean> {
  const maxAgeDays = continueMaxAgeDays(days);
  return sql<boolean>`${sql.raw(updatedAtColumn)} > datetime('now', ${`-${maxAgeDays} days`})`;
}

export function continueFreshProgressAndSql(updatedAtColumn: string, days?: number): RawBuilder<boolean> {
  if (!continueMaxAgeEnabled(days)) return sql<boolean>``;
  return sql<boolean>`and ${continueProgressFreshSql(updatedAtColumn, days)}`;
}
