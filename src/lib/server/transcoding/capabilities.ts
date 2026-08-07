import {
  emptyClientPlaybackCapabilities,
  type ClientPlaybackCapabilities,
  type PlaybackTarget,
} from "$lib/playback/capabilities";
import type { HlsSegmentFormat } from "./hls";
import type { PlaybackPreference, TranscodePolicy } from "./policy";

export type MediaCapabilityInput = {
  extension: string | null;
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
};

type PlaybackTargetProfile = {
  clientCapabilities: Partial<ClientPlaybackCapabilities>;
  allowWebmDirect: boolean;
  allowUniversalDirect: boolean;
};

export type PlaybackModeDecision =
  | { mode: "direct"; reason: "direct_supported" | "transcode_not_needed" }
  | { mode: "remux"; reason: "container_unsupported" }
  | {
      mode: "transcode";
      reason: "user_preference" | "direct_unsupported";
    }
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

function playbackTargetProfile(input: {
  target?: PlaybackTarget;
  clientCapabilities?: Partial<ClientPlaybackCapabilities> | null;
}): PlaybackTargetProfile {
  const clientCapabilities = {
    ...emptyClientPlaybackCapabilities(),
    ...(input.clientCapabilities ?? {}),
  };
  const target = input.target ?? "web";

  switch (target) {
    case "cast":
      return {
        clientCapabilities: {
          ...emptyClientPlaybackCapabilities(),
          hlsNative: true,
          hlsFmp4: true,
        },
        allowWebmDirect: false,
        allowUniversalDirect: false,
      };
    case "airplay":
      return {
        clientCapabilities: {
          ...clientCapabilities,
          hlsNative: true,
          hlsFmp4: true,
          webm: false,
        },
        allowWebmDirect: false,
        allowUniversalDirect: false,
      };
    case "native":
      return {
        clientCapabilities: emptyClientPlaybackCapabilities(),
        allowWebmDirect: false,
        allowUniversalDirect: true,
      };
    case "web":
      return {
        clientCapabilities,
        allowWebmDirect: true,
        allowUniversalDirect: false,
      };
  }
}

function hasBaselineHlsRemuxCompatibleCodecs(input: MediaCapabilityInput) {
  const videoCodec = normalizeCodec(input.videoCodec);
  const audioCodec = normalizeCodec(input.audioCodec);
  return isH264Codec(videoCodec) && isKnownAacCodec(audioCodec);
}

function hasFmp4HevcHlsRemuxCompatibleCodecs(
  input: MediaCapabilityInput,
  clientCapabilities?: Partial<ClientPlaybackCapabilities> | null,
) {
  const videoCodec = normalizeCodec(input.videoCodec);
  const audioCodec = normalizeCodec(input.audioCodec);
  return (
    clientCapabilities?.hlsNative === true &&
    clientCapabilities?.hlsFmp4 === true &&
    clientCapabilities?.hevc === true &&
    isHevcCodec(videoCodec) &&
    isKnownAacCodec(audioCodec)
  );
}

function isHevcCodec(codec: string | null) {
  return (
    codec !== null &&
    (codec === "hevc" ||
      codec === "h265" ||
      codec === "hvc1" ||
      codec === "hev1" ||
      codec.startsWith("hvc1.") ||
      codec.startsWith("hev1."))
  );
}

function isAv1Codec(codec: string | null) {
  return codec !== null && (codec === "av1" || codec === "av01" || codec.startsWith("av01."));
}

function isVp9Codec(codec: string | null) {
  return codec !== null && (codec === "vp9" || codec === "vp09" || codec.startsWith("vp09."));
}

function isVp8Codec(codec: string | null) {
  return codec !== null && codec === "vp8";
}

function isH264Codec(codec: string | null) {
  return (
    codec !== null &&
    (codec === "h264" ||
      codec === "avc" ||
      codec === "avc1" ||
      codec === "avc3" ||
      codec.startsWith("avc1.") ||
      codec.startsWith("avc3."))
  );
}

function isAacCodec(codec: string | null) {
  return codec === null || codec === "aac" || codec === "mp4a" || codec.startsWith("mp4a.");
}

function isKnownAacCodec(codec: string | null) {
  return codec !== null && isAacCodec(codec);
}

function isOpusCodec(codec: string | null) {
  return codec === null || codec === "opus";
}

function isVorbisCodec(codec: string | null) {
  return codec === null || codec === "vorbis";
}

function hasClientMp4CompatibleCodecs(
  input: MediaCapabilityInput,
  clientCapabilities?: Partial<ClientPlaybackCapabilities> | null,
) {
  const videoCodec = normalizeCodec(input.videoCodec);
  const audioCodec = normalizeCodec(input.audioCodec);
  const browserVideo =
    videoCodec === null ||
    isH264Codec(videoCodec) ||
    (clientCapabilities?.hevc === true && isHevcCodec(videoCodec)) ||
    (clientCapabilities?.av1 === true && isAv1Codec(videoCodec));
  return browserVideo && isAacCodec(audioCodec);
}

function hasClientWebmCompatibleCodecs(
  input: MediaCapabilityInput,
  clientCapabilities?: Partial<ClientPlaybackCapabilities> | null,
) {
  if (clientCapabilities?.webm !== true) return false;
  const videoCodec = normalizeCodec(input.videoCodec);
  const audioCodec = normalizeCodec(input.audioCodec);
  const browserVideo =
    videoCodec === null ||
    (clientCapabilities.vp9 === true && isVp9Codec(videoCodec)) ||
    (clientCapabilities.vp8 === true && isVp8Codec(videoCodec)) ||
    (clientCapabilities.av1 === true && isAv1Codec(videoCodec));
  const browserAudio =
    audioCodec === null ||
    (clientCapabilities.opus === true && isOpusCodec(audioCodec)) ||
    (clientCapabilities.vorbis === true && isVorbisCodec(audioCodec));
  return browserVideo && browserAudio;
}

function isMp4Container(extension: string | null, container: string | null) {
  return (
    extension === ".mp4" ||
    extension === ".m4v" ||
    extension === ".mov" ||
    container === "mp4" ||
    container === "mov,mp4,m4a,3gp,3g2,mj2"
  );
}

function isWebmContainer(extension: string | null, container: string | null) {
  return (
    extension === ".webm" ||
    container === "webm" ||
    container === "matroska,webm" ||
    container?.split(",").includes("webm") === true
  );
}

export function isDirectPlayCompatible(
  input: MediaCapabilityInput,
  clientCapabilities?: Partial<ClientPlaybackCapabilities> | null,
  target: PlaybackTarget = "web",
) {
  const extension = normalizeExtension(input.extension);
  const container = normalizeContainer(input.container);
  const profile = playbackTargetProfile({ target, clientCapabilities });

  if (profile.allowUniversalDirect) {
    return Boolean(extension || container);
  }

  if (isMp4Container(extension, container)) {
    return hasClientMp4CompatibleCodecs(input, profile.clientCapabilities);
  }
  if (profile.allowWebmDirect && isWebmContainer(extension, container)) {
    return hasClientWebmCompatibleCodecs(input, profile.clientCapabilities);
  }
  return false;
}

export function isRemuxCompatible(
  input: MediaCapabilityInput,
  clientCapabilities?: Partial<ClientPlaybackCapabilities> | null,
  hlsSegmentFormat: HlsSegmentFormat = "mpegts",
  target: PlaybackTarget = "web",
) {
  if (isDirectPlayCompatible(input, clientCapabilities, target)) return false;
  return isHlsRemuxCompatible(input, clientCapabilities, hlsSegmentFormat, target);
}

function isHlsRemuxCompatible(
  input: MediaCapabilityInput,
  clientCapabilities?: Partial<ClientPlaybackCapabilities> | null,
  hlsSegmentFormat: HlsSegmentFormat = "mpegts",
  target: PlaybackTarget = "web",
) {
  const profile = playbackTargetProfile({ target, clientCapabilities });
  if (profile.allowUniversalDirect) return false;
  if (hasBaselineHlsRemuxCompatibleCodecs(input)) return true;
  return hlsSegmentFormat === "fmp4" && hasFmp4HevcHlsRemuxCompatibleCodecs(input, profile.clientCapabilities);
}

export function decidePlaybackMode(input: {
  file: MediaCapabilityInput;
  policy: Pick<TranscodePolicy, "transcodingEnabled" | "playbackPreference">;
  clientCapabilities?: Partial<ClientPlaybackCapabilities> | null;
  hlsSegmentFormat?: HlsSegmentFormat;
  target?: PlaybackTarget;
}): PlaybackModeDecision {
  const target = input.target ?? "web";
  const profile = playbackTargetProfile({ target, clientCapabilities: input.clientCapabilities });
  const directCompatible = isDirectPlayCompatible(input.file, input.clientCapabilities, target);
  const preference: PlaybackPreference = input.policy.playbackPreference;

  if (profile.allowUniversalDirect) {
    if (directCompatible) {
      return { mode: "direct", reason: "direct_supported" };
    }
    return { mode: "unavailable", reason: "transcoding_disabled" };
  }

  if (directCompatible && (preference === "auto" || preference === "prefer_direct")) {
    return { mode: "direct", reason: "direct_supported" };
  }

  if (preference === "prefer_transcode" && input.policy.transcodingEnabled) {
    return { mode: "transcode", reason: "user_preference" };
  }

  if (!directCompatible && input.policy.transcodingEnabled) {
    return { mode: "transcode", reason: "direct_unsupported" };
  }

  if (directCompatible) return { mode: "direct", reason: "transcode_not_needed" };
  return { mode: "unavailable", reason: "transcoding_disabled" };
}
