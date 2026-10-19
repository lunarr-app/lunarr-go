import type { ReadonlyURL } from "$app/state";

export function sharePlaybackHref(input: { currentUrl: ReadonlyURL; mediaItemId: string }) {
  const url = new URL(input.currentUrl.href);
  url.searchParams.set("play", input.mediaItemId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function shareClosePlaybackHref(sourceUrl: ReadonlyURL) {
  const url = new URL(sourceUrl.href);
  url.searchParams.delete("play");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function sharePlaybackApiPath(token: string, mediaItemId: string) {
  return `/api/share/${encodeURIComponent(token)}/playback/${encodeURIComponent(mediaItemId)}`;
}
