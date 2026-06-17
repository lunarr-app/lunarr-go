export type ClientPlaybackCapabilities = {
  hevc: boolean;
  av1: boolean;
  vp9: boolean;
  vp8: boolean;
  opus: boolean;
  vorbis: boolean;
  webm: boolean;
  hlsFmp4: boolean;
  hlsNative: boolean;
};

export const PLAYBACK_TARGETS = ["web", "cast", "airplay", "native"] as const;
export type PlaybackTarget = (typeof PLAYBACK_TARGETS)[number];

export const CLIENT_PLAYBACK_CAPABILITY_KEYS = [
  "hevc",
  "av1",
  "vp9",
  "vp8",
  "opus",
  "vorbis",
  "webm",
  "hlsFmp4",
  "hlsNative",
] as const satisfies ReadonlyArray<keyof ClientPlaybackCapabilities>;

export function emptyClientPlaybackCapabilities(): ClientPlaybackCapabilities {
  return {
    hevc: false,
    av1: false,
    vp9: false,
    vp8: false,
    opus: false,
    vorbis: false,
    webm: false,
    hlsFmp4: false,
    hlsNative: false,
  };
}

export function normalizePlaybackTarget(value: string | null | undefined): PlaybackTarget {
  return PLAYBACK_TARGETS.includes(value as PlaybackTarget) ? (value as PlaybackTarget) : "web";
}

export const WEB_PLAYBACK_API_QUERY_KEYS = ["file", "start", "transcode"] as const;

export function appendWebPlaybackApiParamsFromPage(apiParams: URLSearchParams, pageUrl: URL) {
  for (const key of WEB_PLAYBACK_API_QUERY_KEYS) {
    const value = pageUrl.searchParams.get(key);
    if (value) apiParams.set(key, value);
  }

  const target = normalizePlaybackTarget(pageUrl.searchParams.get("target"));
  if (target === "cast" || target === "airplay") {
    apiParams.set("target", target);
  }
}

export function webPlaybackApiPath(mediaItemId: string) {
  return `/api/playback/${encodeURIComponent(mediaItemId)}`;
}

export function parseClientPlaybackCapabilityValue(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "probably";
}

export function parseClientPlaybackCapabilities(url: URL): ClientPlaybackCapabilities {
  const capabilities = emptyClientPlaybackCapabilities();
  for (const key of CLIENT_PLAYBACK_CAPABILITY_KEYS) {
    capabilities[key] = parseClientPlaybackCapabilityValue(url.searchParams.get(key));
  }
  return capabilities;
}

function canPlayAny(canPlayType: (type: string) => string, mediaTypes: readonly string[]) {
  return mediaTypes.some((type) => canPlayType(type) !== "");
}

export function detectClientPlaybackCapabilities(
  canPlayType: (type: string) => string,
  options: { mediaSourceSupported?: boolean } = {},
): ClientPlaybackCapabilities {
  const nativeHls = canPlayAny(canPlayType, ["application/vnd.apple.mpegurl", "application/x-mpegURL"]);

  return {
    hevc: canPlayAny(canPlayType, [
      'video/mp4; codecs="hvc1.1.6.L93.B0"',
      'video/mp4; codecs="hev1.1.6.L93.B0"',
      'video/mp4; codecs="hvc1"',
      'video/mp4; codecs="hev1"',
    ]),
    av1: canPlayAny(canPlayType, [
      'video/mp4; codecs="av01.0.08M.08, mp4a.40.2"',
      'video/mp4; codecs="av01.0.05M.08"',
      'video/webm; codecs="av01.0.08M.08, opus"',
    ]),
    vp9: canPlayAny(canPlayType, [
      'video/webm; codecs="vp9, opus"',
      'video/webm; codecs="vp09.00.10.08, opus"',
      'video/webm; codecs="vp9"',
    ]),
    vp8: canPlayAny(canPlayType, [
      'video/webm; codecs="vp8, vorbis"',
      'video/webm; codecs="vp8, opus"',
      'video/webm; codecs="vp8"',
    ]),
    opus: canPlayAny(canPlayType, [
      'audio/ogg; codecs="opus"',
      'audio/webm; codecs="opus"',
      'video/webm; codecs="vp9, opus"',
      'video/webm; codecs="vp8, opus"',
    ]),
    vorbis: canPlayAny(canPlayType, [
      'audio/ogg; codecs="vorbis"',
      'audio/webm; codecs="vorbis"',
      'video/webm; codecs="vp8, vorbis"',
    ]),
    webm: canPlayAny(canPlayType, ["video/webm"]),
    hlsFmp4: options.mediaSourceSupported === true || nativeHls,
    hlsNative: nativeHls,
  };
}

export function appendClientPlaybackCapabilityParams(
  searchParams: URLSearchParams,
  capabilities: Partial<ClientPlaybackCapabilities>,
) {
  for (const key of CLIENT_PLAYBACK_CAPABILITY_KEYS) {
    if (capabilities[key] === true) searchParams.set(key, "1");
  }
}
