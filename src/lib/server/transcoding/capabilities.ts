import type { PlaybackPreference, TranscodePolicy } from "./policy";

export type PlaybackMode = "direct" | "remux" | "transcode";

export type MediaCapabilityInput = {
  extension: string | null;
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
};

export type PlaybackModeDecision =
  | { mode: "direct"; reason: "direct_supported" | "transcode_not_needed" }
  | { mode: "remux"; reason: "container_unsupported" }
  | { mode: "transcode"; reason: "user_preference" | "direct_unsupported" }
  | { mode: "unavailable"; reason: "transcoding_disabled" };

function normalizeCodec(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/_/g, "-") || null;
}

function normalizeExtension(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase() || "";
  if (!trimmed) return null;
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function normalizeContainer(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function hasBrowserCompatibleCodecs(input: MediaCapabilityInput) {
  const videoCodec = normalizeCodec(input.videoCodec);
  const audioCodec = normalizeCodec(input.audioCodec);
  const browserVideo = videoCodec === null || videoCodec === "h264" || videoCodec === "avc1";
  const browserAudio = audioCodec === null || audioCodec === "aac" || audioCodec === "mp4a";
  return browserVideo && browserAudio;
}

export function isDirectPlayCompatible(input: MediaCapabilityInput) {
  const extension = normalizeExtension(input.extension);
  const container = normalizeContainer(input.container);

  const mp4Container = extension === ".mp4" || container === "mp4" || container === "mov,mp4,m4a,3gp,3g2,mj2";
  return mp4Container && hasBrowserCompatibleCodecs(input);
}

export function isRemuxCompatible(input: MediaCapabilityInput) {
  if (isDirectPlayCompatible(input)) return false;
  return hasBrowserCompatibleCodecs(input);
}

export function decidePlaybackMode(input: {
  file: MediaCapabilityInput;
  policy: Pick<TranscodePolicy, "transcodingEnabled" | "playbackPreference">;
}): PlaybackModeDecision {
  const directCompatible = isDirectPlayCompatible(input.file);
  const remuxCompatible = isRemuxCompatible(input.file);
  const preference: PlaybackPreference = input.policy.playbackPreference;

  if (directCompatible && (preference === "auto" || preference === "prefer_direct")) {
    return { mode: "direct", reason: "direct_supported" };
  }

  if (preference === "prefer_transcode" && input.policy.transcodingEnabled) {
    return { mode: "transcode", reason: "user_preference" };
  }

  if (remuxCompatible && input.policy.transcodingEnabled) {
    return { mode: "remux", reason: "container_unsupported" };
  }

  if (!directCompatible && input.policy.transcodingEnabled) {
    return { mode: "transcode", reason: "direct_unsupported" };
  }

  if (directCompatible) return { mode: "direct", reason: "transcode_not_needed" };
  return { mode: "unavailable", reason: "transcoding_disabled" };
}
