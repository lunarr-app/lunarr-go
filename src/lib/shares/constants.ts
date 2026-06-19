export const SHARE_TOKEN_QUERY_PARAM = "shareToken";

const SHARE_EXPIRY_PRESETS_SECONDS = {
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
} as const;

export type ShareExpiryPresetKey = keyof typeof SHARE_EXPIRY_PRESETS_SECONDS;

export const SHARE_EXPIRY_PRESET_OPTIONS: Array<{
  key: ShareExpiryPresetKey;
  label: string;
  seconds: number;
}> = [
  { key: "24h", label: "24 hours", seconds: SHARE_EXPIRY_PRESETS_SECONDS["24h"] },
  { key: "7d", label: "7 days", seconds: SHARE_EXPIRY_PRESETS_SECONDS["7d"] },
  { key: "30d", label: "30 days", seconds: SHARE_EXPIRY_PRESETS_SECONDS["30d"] },
];

export const DEFAULT_SHARE_EXPIRY_SECONDS = SHARE_EXPIRY_PRESETS_SECONDS["7d"];
/** Upper bound for share expiry (~10 years). Custom durations may use the full range. */
export const MAX_SHARE_EXPIRY_SECONDS = 3650 * 24 * 60 * 60;
export const SHARE_LIST_RECENTLY_EXPIRED_MS = 30 * 24 * 60 * 60 * 1000;
export const SHARE_PAGE_SIZE = 25;

export const SHARE_LIST_STATUSES = ["all", "active", "expired", "revoked"] as const;
export type ShareListStatus = (typeof SHARE_LIST_STATUSES)[number];

export const SHARE_RATE_LIMIT_RESOLVE_PER_MINUTE = 60;
export const SHARE_RATE_LIMIT_PLAYBACK_PER_MINUTE = 30;
