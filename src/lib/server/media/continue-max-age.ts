import { sql, type RawBuilder } from "kysely";
import { getSetting, setSetting } from "../settings";

export const MIN_CONTINUE_POSITION_SECONDS = 60;
export const CONTINUE_MAX_AGE_DAYS_MIN = 0;
export const CONTINUE_MAX_AGE_DAYS_MAX = 3650;

export function userContinueMaxAgeDaysKey(userId: string) {
  return `user:${userId}:continue_max_age_days`;
}

export function normalizeContinueMaxAgeDays(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return CONTINUE_MAX_AGE_DAYS_MIN;
  return Math.min(CONTINUE_MAX_AGE_DAYS_MAX, Math.max(CONTINUE_MAX_AGE_DAYS_MIN, Math.floor(parsed)));
}

export async function getContinueMaxAgeDays(userId: string) {
  const raw = await getSetting(userContinueMaxAgeDaysKey(userId));
  return normalizeContinueMaxAgeDays(raw);
}

export async function setUserContinueMaxAgeDays(userId: string, days: string | number | null | undefined) {
  await setSetting(userContinueMaxAgeDaysKey(userId), String(normalizeContinueMaxAgeDays(days)));
}

export function continueMaxAgeEnabledForDays(days: number) {
  return days > 0;
}

function continueMaxAgeCutoffIsoForDays(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function continueMaxAgeCutoffSqlForDays(days: number, now = new Date()): RawBuilder<string> {
  return sql<string>`${continueMaxAgeCutoffIsoForDays(days, now)}`;
}

export function isContinueProgressFresh(
  updatedAt: string,
  options: { maxAgeDays: number; now?: Date } = { maxAgeDays: 0 },
) {
  const { maxAgeDays, now = new Date() } = options;
  if (!continueMaxAgeEnabledForDays(maxAgeDays)) return true;

  return updatedAt > continueMaxAgeCutoffIsoForDays(maxAgeDays, now);
}
