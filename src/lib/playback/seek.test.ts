import { describe, expect, test } from "bun:test";
import {
  absolutePlaybackSeconds,
  createLatestHlsRepositionScheduler,
  hlsRepositionHref,
  initialPlayerTimelineSeconds,
  shouldReloadHlsPlaybackDataOnError,
  shouldRecoverHlsPlaybackError,
  shouldRepositionHlsSeek,
  streamRelativePlaybackSeconds,
} from "./seek";

describe("HLS seek helpers", () => {
  test("detects large ready HLS seeks only", () => {
    expect(
      shouldRepositionHlsSeek({
        mode: "transcode",
        status: "ready",
        fromSeconds: 10,
        toSeconds: 75,
      }),
    ).toBe(true);
    expect(
      shouldRepositionHlsSeek({
        mode: "remux",
        status: "ready",
        fromSeconds: 90,
        toSeconds: 30,
      }),
    ).toBe(true);
    expect(
      shouldRepositionHlsSeek({
        mode: "direct",
        status: "ready",
        fromSeconds: 10,
        toSeconds: 75,
      }),
    ).toBe(false);
    expect(
      shouldRepositionHlsSeek({
        mode: "transcode",
        status: "preparing",
        fromSeconds: 10,
        toSeconds: 75,
      }),
    ).toBe(false);
    expect(
      shouldRepositionHlsSeek({
        mode: "transcode",
        status: "ready",
        fromSeconds: 10,
        toSeconds: 20,
      }),
    ).toBe(false);
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

  test("tracks seek deltas in the player timeline after HLS repositioning", () => {
    expect(
      initialPlayerTimelineSeconds({
        startSeconds: 125,
        streamStartSeconds: 125,
      }),
    ).toBe(125);

    expect(
      shouldRepositionHlsSeek({
        mode: "transcode",
        status: "ready",
        fromSeconds: initialPlayerTimelineSeconds({
          startSeconds: 125,
          streamStartSeconds: 125,
        }),
        toSeconds: 10,
      }),
    ).toBe(true);

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

  test("debounces repeated HLS reposition requests to the latest target", () => {
    let callback: (() => void) | null = null;
    const runCallback = () => {
      if (!callback) throw new Error("Expected scheduled callback.");
      callback();
    };
    const clearedTimers: unknown[] = [];
    const starts: number[] = [];
    const scheduler = createLatestHlsRepositionScheduler({
      delayMs: 120,
      reposition(startSeconds) {
        starts.push(startSeconds);
      },
      setTimer(nextCallback) {
        callback = nextCallback;
        return starts.length + clearedTimers.length + 1;
      },
      clearTimer(timer) {
        clearedTimers.push(timer);
      },
    });

    expect(scheduler.schedule(40)).toBe(true);
    expect(scheduler.pending()).toBe(true);
    expect(scheduler.schedule(52.25)).toBe(true);
    expect(clearedTimers).toHaveLength(1);

    runCallback();

    expect(starts).toEqual([52.25]);
    expect(scheduler.pending()).toBe(false);
  });

  test("can cancel pending HLS reposition requests", () => {
    let callback: (() => void) | null = null;
    const runCallback = () => {
      if (!callback) throw new Error("Expected scheduled callback.");
      callback();
    };
    const starts: number[] = [];
    const scheduler = createLatestHlsRepositionScheduler({
      reposition(startSeconds) {
        starts.push(startSeconds);
      },
      setTimer(nextCallback) {
        callback = nextCallback;
        return 1;
      },
      clearTimer() {
        return;
      },
    });

    expect(scheduler.schedule(40)).toBe(true);
    scheduler.cancel();
    runCallback();

    expect(starts).toEqual([]);
    expect(scheduler.pending()).toBe(false);
    expect(scheduler.schedule(-1)).toBe(false);
  });

  test("cancels a pending HLS reposition when the seek returns near the last stable time", () => {
    let callback: (() => void) | null = null;
    const runCallback = () => {
      if (!callback) throw new Error("Expected scheduled callback.");
      callback();
    };
    const starts: number[] = [];
    const scheduler = createLatestHlsRepositionScheduler({
      reposition(startSeconds) {
        starts.push(startSeconds);
      },
      setTimer(nextCallback) {
        callback = nextCallback;
        return 1;
      },
      clearTimer() {
        return;
      },
    });
    const stableSeconds = 120;
    const scheduleSeek = (targetSeconds: number) => {
      if (
        shouldRepositionHlsSeek({
          mode: "transcode",
          status: "ready",
          fromSeconds: stableSeconds,
          toSeconds: targetSeconds,
        })
      ) {
        return scheduler.schedule(targetSeconds);
      }
      scheduler.cancel();
      return false;
    };

    expect(scheduleSeek(220)).toBe(true);
    expect(scheduler.pending()).toBe(true);
    expect(scheduleSeek(126)).toBe(false);
    expect(scheduler.pending()).toBe(false);

    runCallback();

    expect(starts).toEqual([]);
  });
});
