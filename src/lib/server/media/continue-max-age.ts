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

function continueMaxAgeCutoffIso(now = new Date()): string {
  return new Date(now.getTime() - continueMaxAgeDays() * 24 * 60 * 60 * 1000).toISOString();
}

export function continueMaxAgeEnabled(): boolean {
  return continueMaxAgeDays() > 0;
}

export function isContinueProgressFresh(updatedAt: string, now = new Date()): boolean {
  if (!continueMaxAgeEnabled()) return true;

  return updatedAt > continueMaxAgeCutoffIso(now);
}

export function continueMaxAgeCutoffSql(now = new Date()): RawBuilder<string> {
  return sql<string>`${continueMaxAgeCutoffIso(now)}`;
}
