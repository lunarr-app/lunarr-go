import type { ReadonlyURL } from "$app/state";

export function playbackModalHref(input: {
  currentUrl: ReadonlyURL;
  mediaItemId: string;
  mediaFileId?: string | null;
}) {
  const url = new URL(input.currentUrl.href);
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
