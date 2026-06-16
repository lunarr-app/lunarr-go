import { getBooleanSetting, getSetting, setBooleanSetting, setSetting } from "../settings";

export const PLAYBACK_PREFERENCES = ["auto", "prefer_direct", "prefer_transcode"] as const;
export const HARDWARE_ACCELERATION_MODES = ["off", "auto", "videotoolbox", "vaapi", "qsv", "nvenc", "amf"] as const;
export const TRANSCODE_QUALITY_PRESETS = ["auto", "720p", "1080p", "original"] as const;

export type PlaybackPreference = (typeof PLAYBACK_PREFERENCES)[number];
export type HardwareAccelerationMode = (typeof HARDWARE_ACCELERATION_MODES)[number];
export type TranscodeQualityPreset = (typeof TRANSCODE_QUALITY_PRESETS)[number];

export type TranscodeQualityTarget = {
  preset: TranscodeQualityPreset;
  maxHeight: number | null;
  softwareCrf: number;
  hardwareBitrate: string;
};

export type TranscodePolicy = {
  transcodingEnabled: boolean;
  playbackPreference: PlaybackPreference;
  preferredAudioLanguage: string | null;
  preferredSubtitleLanguage: string | null;
  hardwareAcceleration: HardwareAccelerationMode;
  hardwareAccelerationRequired: boolean;
  transcodeQualityPreset: TranscodeQualityPreset;
  transcodeQuality: TranscodeQualityTarget;
};

const TRANSCODING_ENABLED_KEY = "transcoding_enabled";
const HARDWARE_ACCELERATION_KEY = "hardware_acceleration";
const HARDWARE_ACCELERATION_REQUIRED_KEY = "hardware_acceleration_required";
const TRANSCODE_QUALITY_PRESET_KEY = "transcode_quality_preset";

function userPlaybackPreferenceKey(userId: string) {
  return `user:${userId}:playback_preference`;
}

function userPreferredAudioLanguageKey(userId: string) {
  return `user:${userId}:preferred_audio_language`;
}

function userPreferredSubtitleLanguageKey(userId: string) {
  return `user:${userId}:preferred_subtitle_language`;
}

export function normalizePlaybackPreference(value: string | null | undefined): PlaybackPreference {
  return PLAYBACK_PREFERENCES.includes(value as PlaybackPreference) ? (value as PlaybackPreference) : "auto";
}

export function normalizePreferredAudioLanguage(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized.slice(0, 32) : null;
}

export function normalizeHardwareAccelerationMode(value: string | null | undefined): HardwareAccelerationMode {
  return HARDWARE_ACCELERATION_MODES.includes(value as HardwareAccelerationMode)
    ? (value as HardwareAccelerationMode)
    : "off";
}

export function normalizeTranscodeQualityPreset(value: string | null | undefined): TranscodeQualityPreset {
  return TRANSCODE_QUALITY_PRESETS.includes(value as TranscodeQualityPreset)
    ? (value as TranscodeQualityPreset)
    : "auto";
}

export function transcodeQualityTarget(preset: TranscodeQualityPreset): TranscodeQualityTarget {
  switch (preset) {
    case "720p":
      return {
        preset,
        maxHeight: 720,
        softwareCrf: 24,
        hardwareBitrate: "3M",
      };
    case "1080p":
      return {
        preset,
        maxHeight: 1080,
        softwareCrf: 23,
        hardwareBitrate: "5M",
      };
    case "original":
      return {
        preset,
        maxHeight: null,
        softwareCrf: 22,
        hardwareBitrate: "8M",
      };
    case "auto":
      return {
        preset,
        maxHeight: null,
        softwareCrf: 23,
        hardwareBitrate: "5M",
      };
  }
}

export async function getUserPlaybackPreference(userId: string | null | undefined): Promise<PlaybackPreference> {
  if (!userId) return "auto";
  return normalizePlaybackPreference(await getSetting(userPlaybackPreferenceKey(userId)));
}

export async function getUserPreferredAudioLanguage(userId: string | null | undefined) {
  if (!userId) return null;
  return normalizePreferredAudioLanguage(await getSetting(userPreferredAudioLanguageKey(userId)));
}

export async function getUserPreferredSubtitleLanguage(userId: string | null | undefined) {
  if (!userId) return null;
  return normalizePreferredAudioLanguage(await getSetting(userPreferredSubtitleLanguageKey(userId)));
}

export async function setUserPlaybackPreference(userId: string, value: PlaybackPreference) {
  await setSetting(userPlaybackPreferenceKey(userId), value);
}

export async function setUserPreferredAudioLanguage(userId: string, value: string | null | undefined) {
  await setSetting(userPreferredAudioLanguageKey(userId), normalizePreferredAudioLanguage(value) ?? "");
}

export async function setUserPreferredSubtitleLanguage(userId: string, value: string | null | undefined) {
  await setSetting(userPreferredSubtitleLanguageKey(userId), normalizePreferredAudioLanguage(value) ?? "");
}

export async function getTranscodePolicy(userId?: string | null): Promise<TranscodePolicy> {
  const [
    transcodingEnabled,
    playbackPreference,
    preferredAudioLanguage,
    preferredSubtitleLanguage,
    hardwareAcceleration,
    hardwareAccelerationRequired,
    transcodeQualityPreset,
  ] = await Promise.all([
    getBooleanSetting(TRANSCODING_ENABLED_KEY, true),
    getUserPlaybackPreference(userId),
    getUserPreferredAudioLanguage(userId),
    getUserPreferredSubtitleLanguage(userId),
    getSetting(HARDWARE_ACCELERATION_KEY).then(normalizeHardwareAccelerationMode),
    getBooleanSetting(HARDWARE_ACCELERATION_REQUIRED_KEY, false),
    getSetting(TRANSCODE_QUALITY_PRESET_KEY).then(normalizeTranscodeQualityPreset),
  ]);

  return {
    transcodingEnabled,
    playbackPreference,
    preferredAudioLanguage,
    preferredSubtitleLanguage,
    hardwareAcceleration,
    hardwareAccelerationRequired: hardwareAcceleration !== "off" && hardwareAccelerationRequired,
    transcodeQualityPreset,
    transcodeQuality: transcodeQualityTarget(transcodeQualityPreset),
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

export async function setTranscodeQualityPreset(value: TranscodeQualityPreset) {
  await setSetting(TRANSCODE_QUALITY_PRESET_KEY, value);
}
