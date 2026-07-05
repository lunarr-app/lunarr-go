import { sql, type RawBuilder } from "kysely";
import { appEnv } from "$lib/server/config/env";

let testContinueMaxAgeDays: number | undefined;

export function setContinueMaxAgeDaysForTests(days: number | undefined) {
  testContinueMaxAgeDays = days;
}

export function continueMaxAgeDays(days?: number): number {
  if (days !== undefined) return days;
  return testContinueMaxAgeDays ?? appEnv.LUNARR_CONTINUE_MAX_AGE_DAYS;
}

export function continueMaxAgeEnabled(days?: number): boolean {
  return continueMaxAgeDays(days) > 0;
}

export function isContinueProgressFresh(updatedAt: string, days?: number, now = new Date()): boolean {
  const maxAgeDays = continueMaxAgeDays(days);
  if (maxAgeDays <= 0) return true;

  const cutoffMs = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
  return new Date(updatedAt).getTime() > cutoffMs;
}

export function continueProgressFreshSql(updatedAtColumn: string, days?: number): RawBuilder<boolean> {
  const maxAgeDays = continueMaxAgeDays(days);
  return sql<boolean>`${sql.raw(updatedAtColumn)} > datetime('now', ${`-${maxAgeDays} days`})`;
}

export function continueFreshProgressAndSql(updatedAtColumn: string, days?: number): RawBuilder<unknown> {
  if (!continueMaxAgeEnabled(days)) return sql``;
  return sql`and ${continueProgressFreshSql(updatedAtColumn, days)}`;
}
