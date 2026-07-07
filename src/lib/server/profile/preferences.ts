import type { ProfilePreferencesUpdate } from "$lib/server/api/types";
import { getContinueMaxAgeDays, setUserContinueMaxAgeDays } from "$lib/server/media/continue-max-age";
import {
  DEFAULT_SEGMENT_SKIP_PREFERENCES,
  getSegmentSkipPreferences,
  normalizeBooleanSetting,
  setSegmentSkipPreferences,
  type SegmentSkipPreferences,
} from "$lib/server/playback/segment-skip-preferences";
import {
  getTranscodePolicy,
  normalizePlaybackPreference,
  setUserPlaybackPreference,
  setUserPreferredAudioLanguage,
  setUserPreferredSubtitleLanguage,
} from "$lib/server/transcoding/policy";

const PROFILE_PREFERENCE_KEYS = [
  "playbackPreference",
  "preferredAudioLanguage",
  "preferredSubtitleLanguage",
  "continueMaxAgeDays",
  "segmentSkipEnabled",
  "segmentSkipAutomatic",
] as const;

export function hasProfilePreferenceUpdate(body: ProfilePreferencesUpdate) {
  return PROFILE_PREFERENCE_KEYS.some((key) => key in body);
}

export async function updateUserProfilePreferences(userId: string, body: ProfilePreferencesUpdate) {
  if ("playbackPreference" in body) {
    await setUserPlaybackPreference(userId, normalizePlaybackPreference(String(body.playbackPreference ?? "")));
  }
  if ("preferredAudioLanguage" in body) {
    await setUserPreferredAudioLanguage(userId, String(body.preferredAudioLanguage ?? ""));
  }
  if ("preferredSubtitleLanguage" in body) {
    await setUserPreferredSubtitleLanguage(userId, String(body.preferredSubtitleLanguage ?? ""));
  }
  if ("continueMaxAgeDays" in body) {
    await setUserContinueMaxAgeDays(userId, body.continueMaxAgeDays as string | number | null | undefined);
  }
  const segmentSkipUpdate: Partial<SegmentSkipPreferences> = {};
  if ("segmentSkipEnabled" in body) {
    segmentSkipUpdate.enabled = normalizeBooleanSetting(
      body.segmentSkipEnabled as string | boolean | null | undefined,
      DEFAULT_SEGMENT_SKIP_PREFERENCES.enabled,
    );
  }
  if ("segmentSkipAutomatic" in body) {
    segmentSkipUpdate.automatic = normalizeBooleanSetting(
      body.segmentSkipAutomatic as string | boolean | null | undefined,
      DEFAULT_SEGMENT_SKIP_PREFERENCES.automatic,
    );
  }
  if (Object.keys(segmentSkipUpdate).length > 0) {
    await setSegmentSkipPreferences(userId, segmentSkipUpdate);
  }
}

export async function getUserProfilePreferences(userId: string) {
  return {
    transcodePolicy: await getTranscodePolicy(userId),
    continueMaxAgeDays: await getContinueMaxAgeDays(userId),
    segmentSkip: await getSegmentSkipPreferences(userId),
  };
}
