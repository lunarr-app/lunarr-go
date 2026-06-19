export function sharePlaybackHref(input: { currentUrl: URL; mediaItemId: string }) {
  const url = new URL(input.currentUrl);
  url.searchParams.set("play", input.mediaItemId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function shareClosePlaybackHref(sourceUrl: URL) {
  const url = new URL(sourceUrl);
  url.searchParams.delete("play");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function sharePlaybackApiPath(token: string, mediaItemId: string) {
  return `/api/share/${encodeURIComponent(token)}/playback/${encodeURIComponent(mediaItemId)}`;
}
