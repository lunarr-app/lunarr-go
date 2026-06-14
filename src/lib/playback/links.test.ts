import { describe, expect, test } from "bun:test";
import { playbackModalHref } from "./links";

describe("playback modal links", () => {
  test("preserves current page filters while opening playback", () => {
    expect(
      playbackModalHref({
        currentUrl: new URL("http://localhost/movies?q=heat&status=unwatched#grid"),
        mediaItemId: "movie-1",
        mediaFileId: "file-1",
      }),
    ).toBe("/movies?q=heat&status=unwatched&play=movie-1&file=file-1#grid");
  });

  test("clears stale seek and transcode params for a fresh play click", () => {
    expect(
      playbackModalHref({
        currentUrl: new URL("http://localhost/shows/show-1?play=old&file=old-file&start=40&transcode=1"),
        mediaItemId: "episode-1",
        mediaFileId: null,
      }),
    ).toBe("/shows/show-1?play=episode-1");
  });
});
