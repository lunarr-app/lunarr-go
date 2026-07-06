import type { ProfilePreferencesUpdate } from "$lib/server/api/types";
import { getContinueMaxAgeDays, setUserContinueMaxAgeDays } from "$lib/server/media/continue-max-age";
import {
  getTranscodePolicy,
  normalizePlaybackPreference,
  setUserPlaybackPreference,
  setUserPreferredAudioLanguage,
  setUserPreferredSubtitleLanguage,
} from "$lib/server/transcoding/policy";

export type { ProfilePreferencesUpdate } from "$lib/server/api/types";

const PROFILE_PREFERENCE_KEYS = [
  "playbackPreference",
  "preferredAudioLanguage",
  "preferredSubtitleLanguage",
  "continueMaxAgeDays",
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
}

export async function getUserProfilePreferences(userId: string) {
  return {
    transcodePolicy: await getTranscodePolicy(userId),
    continueMaxAgeDays: await getContinueMaxAgeDays(userId),
  };
}
