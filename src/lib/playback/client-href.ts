import { browser } from "$app/environment";
import {
  appendClientPlaybackCapabilityParams,
  appendWebPlaybackApiParamsFromPage,
  detectClientPlaybackCapabilities,
} from "$lib/playback/capabilities";

export function canUseFmp4MediaSource() {
  if (!browser || !("MediaSource" in window)) return false;
  return window.MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
}

export function buildClientPlaybackApiHref(input: { pathname: string; sourceUrl: URL }) {
  const apiUrl = new URL(input.pathname, input.sourceUrl.origin);
  appendWebPlaybackApiParamsFromPage(apiUrl.searchParams, input.sourceUrl);
  if (browser) {
    const video = document.createElement("video");
    appendClientPlaybackCapabilityParams(
      apiUrl.searchParams,
      detectClientPlaybackCapabilities((type) => video.canPlayType(type), {
        mediaSourceSupported: canUseFmp4MediaSource(),
      }),
    );
  }
  return `${apiUrl.pathname}${apiUrl.search}`;
}
