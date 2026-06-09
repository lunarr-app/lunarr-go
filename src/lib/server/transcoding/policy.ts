import { getBooleanSetting, getSetting, setBooleanSetting, setSetting } from "../settings";

export const PLAYBACK_PREFERENCES = ["auto", "prefer_direct", "prefer_transcode"] as const;
export const HARDWARE_ACCELERATION_MODES = ["off", "auto", "videotoolbox", "vaapi", "qsv", "nvenc", "amf"] as const;

export type PlaybackPreference = (typeof PLAYBACK_PREFERENCES)[number];
export type HardwareAccelerationMode = (typeof HARDWARE_ACCELERATION_MODES)[number];

export type TranscodePolicy = {
  transcodingEnabled: boolean;
  playbackPreference: PlaybackPreference;
  hardwareAcceleration: HardwareAccelerationMode;
  hardwareAccelerationRequired: boolean;
};

const TRANSCODING_ENABLED_KEY = "transcoding_enabled";
const HARDWARE_ACCELERATION_KEY = "hardware_acceleration";
const HARDWARE_ACCELERATION_REQUIRED_KEY = "hardware_acceleration_required";

function userPlaybackPreferenceKey(userId: string) {
  return `user:${userId}:playback_preference`;
}

export function normalizePlaybackPreference(value: string | null | undefined): PlaybackPreference {
  return PLAYBACK_PREFERENCES.includes(value as PlaybackPreference) ? (value as PlaybackPreference) : "auto";
}

export function normalizeHardwareAccelerationMode(value: string | null | undefined): HardwareAccelerationMode {
  return HARDWARE_ACCELERATION_MODES.includes(value as HardwareAccelerationMode) ? (value as HardwareAccelerationMode) : "off";
}

export async function getUserPlaybackPreference(userId: string | null | undefined): Promise<PlaybackPreference> {
  if (!userId) return "auto";
  return normalizePlaybackPreference(await getSetting(userPlaybackPreferenceKey(userId)));
}

export async function setUserPlaybackPreference(userId: string, value: PlaybackPreference) {
  await setSetting(userPlaybackPreferenceKey(userId), value);
}

export async function getTranscodePolicy(userId?: string | null): Promise<TranscodePolicy> {
  const [
    transcodingEnabled,
    playbackPreference,
    hardwareAcceleration,
    hardwareAccelerationRequired
  ] = await Promise.all([
    getBooleanSetting(TRANSCODING_ENABLED_KEY, true),
    getUserPlaybackPreference(userId),
    getSetting(HARDWARE_ACCELERATION_KEY).then(normalizeHardwareAccelerationMode),
    getBooleanSetting(HARDWARE_ACCELERATION_REQUIRED_KEY, false)
  ]);

  return {
    transcodingEnabled,
    playbackPreference,
    hardwareAcceleration,
    hardwareAccelerationRequired:
      hardwareAcceleration !== "off" && hardwareAccelerationRequired,
  };
}

export async function setTranscodingEnabled(value: boolean) {
  await setBooleanSetting(TRANSCODING_ENABLED_KEY, value);
}

export async function setHardwareAccelerationMode(value: HardwareAccelerationMode) {
  await setSetting(HARDWARE_ACCELERATION_KEY, value);
}

export async function setHardwareAccelerationRequired(value: boolean) {
  await setBooleanSetting(HARDWARE_ACCELERATION_REQUIRED_KEY, value);
}
