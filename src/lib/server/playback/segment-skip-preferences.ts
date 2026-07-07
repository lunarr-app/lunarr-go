import { getBooleanSetting, setBooleanSetting } from "../settings";

export type SegmentSkipPreferences = {
  enabled: boolean;
  automatic: boolean;
};

const DEFAULT_SEGMENT_SKIP_PREFERENCES: SegmentSkipPreferences = {
  enabled: true,
  automatic: false,
};

function userSegmentSkipEnabledKey(userId: string) {
  return `user:${userId}:segment_skip_enabled`;
}

function userSegmentSkipAutomaticKey(userId: string) {
  return `user:${userId}:segment_skip_automatic`;
}

function normalizeBooleanSetting(value: string | boolean | null | undefined, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true" || value === "on") return true;
  if (value === "0" || value === "false" || value === "off") return false;
  return fallback;
}

export function normalizeSegmentSkipEnabled(value: string | boolean | null | undefined) {
  return normalizeBooleanSetting(value, DEFAULT_SEGMENT_SKIP_PREFERENCES.enabled);
}

export function normalizeSegmentSkipAutomatic(value: string | boolean | null | undefined) {
  return normalizeBooleanSetting(value, DEFAULT_SEGMENT_SKIP_PREFERENCES.automatic);
}

export async function getSegmentSkipPreferences(userId: string | null | undefined): Promise<SegmentSkipPreferences> {
  if (!userId) return DEFAULT_SEGMENT_SKIP_PREFERENCES;

  const [enabled, automatic] = await Promise.all([
    getBooleanSetting(userSegmentSkipEnabledKey(userId), DEFAULT_SEGMENT_SKIP_PREFERENCES.enabled),
    getBooleanSetting(userSegmentSkipAutomaticKey(userId), DEFAULT_SEGMENT_SKIP_PREFERENCES.automatic),
  ]);

  return { enabled, automatic };
}

export async function setSegmentSkipPreferences(userId: string, update: Partial<SegmentSkipPreferences>) {
  if (update.enabled !== undefined) {
    await setBooleanSetting(userSegmentSkipEnabledKey(userId), update.enabled);
  }
  if (update.automatic !== undefined) {
    await setBooleanSetting(userSegmentSkipAutomaticKey(userId), update.automatic);
  }
}
