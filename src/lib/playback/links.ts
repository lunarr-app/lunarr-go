export function playbackModalHref(input: { currentUrl: URL; mediaItemId: string; mediaFileId?: string | null }) {
  const url = new URL(input.currentUrl);
  url.searchParams.set("play", input.mediaItemId);
  if (input.mediaFileId) {
    url.searchParams.set("file", input.mediaFileId);
  } else {
    url.searchParams.delete("file");
  }
  url.searchParams.delete("start");
  url.searchParams.delete("transcode");
  return `${url.pathname}${url.search}${url.hash}`;
}
