import { getBooleanSetting, setBooleanSetting } from "../settings";

export type SegmentSkipPreferences = {
  enabled: boolean;
  automatic: boolean;
};

export const DEFAULT_SEGMENT_SKIP_PREFERENCES: SegmentSkipPreferences = {
  enabled: true,
  automatic: false,
};

export function normalizeBooleanSetting(value: string | boolean | null | undefined, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true" || value === "on") return true;
  if (value === "0" || value === "false" || value === "off") return false;
  return fallback;
}

export async function getSegmentSkipPreferences(userId: string | null | undefined): Promise<SegmentSkipPreferences> {
  if (!userId) return DEFAULT_SEGMENT_SKIP_PREFERENCES;

  const [enabled, automatic] = await Promise.all([
    getBooleanSetting(`user:${userId}:segment_skip_enabled`, DEFAULT_SEGMENT_SKIP_PREFERENCES.enabled),
    getBooleanSetting(`user:${userId}:segment_skip_automatic`, DEFAULT_SEGMENT_SKIP_PREFERENCES.automatic),
  ]);

  return { enabled, automatic };
}

export async function setSegmentSkipPreferences(userId: string, update: Partial<SegmentSkipPreferences>) {
  if (update.enabled !== undefined) {
    await setBooleanSetting(`user:${userId}:segment_skip_enabled`, update.enabled);
  }
  if (update.automatic !== undefined) {
    await setBooleanSetting(`user:${userId}:segment_skip_automatic`, update.automatic);
  }
}
