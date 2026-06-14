import { describe, expect, test } from "bun:test";
import {
  absolutePlaybackSeconds,
  createHlsSeekEventController,
  hlsRepositionHref,
  initialPlayerTimelineSeconds,
  isHlsPlaybackMode,
  playbackTargetHref,
  shouldReloadHlsPlaybackDataOnError,
  shouldRecoverHlsPlaybackError,
  streamRelativePlaybackSeconds,
} from "./seek";

describe("HLS seek helpers", () => {
  test("detects HLS playback modes", () => {
    expect(isHlsPlaybackMode("transcode")).toBe(true);
    expect(isHlsPlaybackMode("remux")).toBe(true);
    expect(isHlsPlaybackMode("direct")).toBe(false);
  });

  test("builds a same-page start URL for HLS repositioning", () => {
    expect(
      hlsRepositionHref({
        currentUrl: new URL(
          "http://localhost/movies/movie-1?play=movie-1&file=old&foo=bar#player",
        ),
        mediaFileId: "file-1",
        startSeconds: 125.8,
      }),
    ).toBe("/movies/movie-1?play=movie-1&file=file-1&foo=bar&start=125#player");

    expect(
      hlsRepositionHref({
        currentUrl: new URL(
          "http://localhost/movies/movie-1?play=movie-1&file=old&foo=bar#player",
        ),
        mediaFileId: "file-1",
        startSeconds: 125.8,
        forceTranscode: true,
      }),
    ).toBe(
      "/movies/movie-1?play=movie-1&file=file-1&foo=bar&start=125&transcode=1#player",
    );

    expect(
      hlsRepositionHref({
        currentUrl: new URL(
          "http://localhost/movies/movie-1?play=movie-1&file=old&start=40&transcode=1#player",
        ),
        mediaFileId: "file-1",
        startSeconds: 0,
      }),
    ).toBe("/movies/movie-1?play=movie-1&file=file-1&transcode=1#player");
  });

  test("builds a same-page target URL for remote playback", () => {
    expect(
      playbackTargetHref({
        currentUrl: new URL(
          "http://localhost/movies/movie-1?play=movie-1&file=old&foo=bar#player",
        ),
        mediaFileId: "file-1",
        target: "cast",
        startSeconds: 125.8,
      }),
    ).toBe(
      "/movies/movie-1?play=movie-1&file=file-1&foo=bar&target=cast&start=125#player",
    );

    expect(
      playbackTargetHref({
        currentUrl: new URL(
          "http://localhost/movies/movie-1?play=movie-1&file=old&start=40&transcode=1&target=cast#player",
        ),
        mediaFileId: "file-1",
        target: "airplay",
        startSeconds: 0,
      }),
    ).toBe(
      "/movies/movie-1?play=movie-1&file=file-1&transcode=1&target=airplay#player",
    );
  });

  test("builds a same-page target URL for local web playback", () => {
    expect(
      playbackTargetHref({
        currentUrl: new URL(
          "http://localhost/movies/movie-1?play=movie-1&file=old&target=cast&start=40#player",
        ),
        mediaFileId: "file-1",
        target: "web",
        startSeconds: 125.8,
      }),
    ).toBe("/movies/movie-1?play=movie-1&file=file-1&start=125#player");

    expect(
      playbackTargetHref({
        currentUrl: new URL(
          "http://localhost/movies/movie-1?play=movie-1&file=old&target=airplay&start=40&transcode=1#player",
        ),
        mediaFileId: "file-1",
        target: "web",
        startSeconds: 0,
      }),
    ).toBe("/movies/movie-1?play=movie-1&file=file-1&transcode=1#player");
  });

  test("recovers HLS playback errors only after playback has started", () => {
    expect(
      shouldRecoverHlsPlaybackError({
        mode: "transcode",
        status: "ready",
        currentSeconds: 65,
        hasPlaybackActivity: true,
      }),
    ).toBe(true);
    expect(
      shouldRecoverHlsPlaybackError({
        mode: "remux",
        status: "ready",
        currentSeconds: 65,
        hasPlaybackActivity: false,
      }),
    ).toBe(true);
    expect(
      shouldRecoverHlsPlaybackError({
        mode: "transcode",
        status: "ready",
        currentSeconds: 0,
        hasPlaybackActivity: true,
      }),
    ).toBe(false);
    expect(
      shouldRecoverHlsPlaybackError({
        mode: "transcode",
        status: "ready",
        currentSeconds: 0,
        hasPlaybackActivity: false,
      }),
    ).toBe(false);
    expect(
      shouldRecoverHlsPlaybackError({
        mode: "direct",
        status: "ready",
        currentSeconds: 65,
        hasPlaybackActivity: true,
      }),
    ).toBe(false);
  });

  test("does not reload HLS playback data at zero seconds", () => {
    expect(
      shouldReloadHlsPlaybackDataOnError({
        mode: "transcode",
        status: "ready",
        currentSeconds: 0,
        hasPlaybackActivity: false,
      }),
    ).toBe(false);
    expect(
      shouldReloadHlsPlaybackDataOnError({
        mode: "remux",
        status: "ready",
        currentSeconds: 0,
        hasPlaybackActivity: false,
      }),
    ).toBe(false);
    expect(
      shouldReloadHlsPlaybackDataOnError({
        mode: "transcode",
        status: "ready",
        currentSeconds: 0,
        hasPlaybackActivity: true,
      }),
    ).toBe(false);
    expect(
      shouldReloadHlsPlaybackDataOnError({
        mode: "transcode",
        status: "ready",
        currentSeconds: 0,
        hasPlaybackActivity: true,
        hasLoadedMetadata: true,
      }),
    ).toBe(false);
    expect(
      shouldReloadHlsPlaybackDataOnError({
        mode: "transcode",
        status: "ready",
        currentSeconds: 0,
        hasPlaybackActivity: false,
        hasLoadedMetadata: true,
      }),
    ).toBe(false);
    expect(
      shouldReloadHlsPlaybackDataOnError({
        mode: "transcode",
        status: "ready",
        currentSeconds: 15,
        hasPlaybackActivity: false,
      }),
    ).toBe(false);
    expect(
      shouldReloadHlsPlaybackDataOnError({
        mode: "direct",
        status: "ready",
        currentSeconds: 0,
        hasPlaybackActivity: false,
      }),
    ).toBe(false);
  });

  test("tracks seek deltas in the player timeline", () => {
    expect(
      initialPlayerTimelineSeconds({
        startSeconds: 125,
        streamStartSeconds: 125,
      }),
    ).toBe(125);

    expect(
      initialPlayerTimelineSeconds({
        startSeconds: 45,
        streamStartSeconds: 0,
      }),
    ).toBe(45);
  });

  test("converts between media time and HLS stream-relative time", () => {
    expect(
      streamRelativePlaybackSeconds({
        absoluteSeconds: 1174,
        streamStartSeconds: 1174,
      }),
    ).toBe(0);
    expect(
      streamRelativePlaybackSeconds({
        absoluteSeconds: 1200,
        streamStartSeconds: 1174,
      }),
    ).toBe(26);
    expect(
      absolutePlaybackSeconds({
        relativeSeconds: 26,
        streamStartSeconds: 1174,
      }),
    ).toBe(1200);
    expect(
      streamRelativePlaybackSeconds({
        absoluteSeconds: 30,
        streamStartSeconds: 1174,
      }),
    ).toBe(0);
  });

  test("handles browser-style HLS seek event churn against stream-relative currentTime", () => {
    const controller = createHlsSeekEventController({
      startSeconds: 120,
      streamStartSeconds: 120,
    });

    expect(controller.lastPlaybackTime()).toBe(120);

    controller.timeUpdate({ relativeSeconds: 8, seeking: false });
    expect(controller.lastPlaybackTime()).toBe(128);

    expect(controller.seeking()).toEqual({
      uiState: "seeking",
    });
    expect(controller.seeked({ relativeSeconds: 220, paused: false })).toEqual({
      uiState: "playing",
    });

    expect(controller.lastPlaybackTime()).toBe(340);
  });

  test("keeps full-timeline HLS seeks in the current playback session", () => {
    const controller = createHlsSeekEventController({
      startSeconds: 0,
      streamStartSeconds: 0,
    });

    controller.timeUpdate({ relativeSeconds: 23 * 60, seeking: false });
    expect(controller.lastPlaybackTime()).toBe(23 * 60);

    expect(controller.seeking()).toEqual({
      uiState: "seeking",
    });
    expect(controller.seeked({ relativeSeconds: 11 * 60, paused: false })).toEqual(
      {
        uiState: "playing",
      },
    );

    expect(controller.lastPlaybackTime()).toBe(11 * 60);
  });
});
