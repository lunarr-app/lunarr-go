import { describe, expect, test } from "bun:test";
import {
  absolutePlaybackSeconds,
  createHlsSeekEventController,
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

  test("keeps only the latest target during rapid HLS seek churn", () => {
    let callback: (() => void) | null = null;
    const starts: number[] = [];
    const clearedTimers: unknown[] = [];
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
    const runCallback = () => {
      if (!callback) throw new Error("Expected scheduled callback.");
      callback();
    };
    const stableSeconds = 60;
    const seekTo = (targetSeconds: number) => {
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

    expect(seekTo(180)).toBe(true);
    expect(seekTo(20)).toBe(true);
    expect(seekTo(240)).toBe(true);
    expect(clearedTimers).toHaveLength(2);
    expect(scheduler.pending()).toBe(true);
    runCallback();

    expect(starts).toEqual([240]);
    expect(scheduler.pending()).toBe(false);

    expect(seekTo(140)).toBe(true);
    expect(seekTo(64)).toBe(false);
    runCallback();

    expect(starts).toEqual([240]);
    expect(scheduler.pending()).toBe(false);
  });

  test("handles browser-style HLS seek event churn against stream-relative currentTime", () => {
    let callback: (() => void) | null = null;
    const starts: number[] = [];
    const clearedTimers: unknown[] = [];
    const controller = createHlsSeekEventController({
      mode: "transcode",
      status: "ready",
      startSeconds: 120,
      streamStartSeconds: 120,
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
    const runCallback = () => {
      if (!callback) throw new Error("Expected scheduled callback.");
      callback();
    };

    expect(controller.lastPlaybackTime()).toBe(120);

    controller.timeUpdate({ relativeSeconds: 8, seeking: false });
    expect(controller.lastPlaybackTime()).toBe(128);

    expect(controller.seeking({ relativeSeconds: 180 })).toEqual({
      uiState: "seeking",
      pendingReposition: true,
    });
    expect(controller.seeked({ relativeSeconds: 220, paused: false })).toEqual({
      uiState: "seeking",
      pendingReposition: true,
    });
    expect(clearedTimers).toHaveLength(1);

    runCallback();

    expect(starts).toEqual([340]);
    expect(controller.pending()).toBe(false);
    expect(controller.lastPlaybackTime()).toBe(128);
  });

  test("cancels pending browser-style HLS reposition after a near-stable seeked event", () => {
    let callback: (() => void) | null = null;
    const starts: number[] = [];
    const controller = createHlsSeekEventController({
      mode: "remux",
      status: "ready",
      startSeconds: 90,
      streamStartSeconds: 90,
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
    const runCallback = () => {
      if (!callback) throw new Error("Expected scheduled callback.");
      callback();
    };

    controller.timeUpdate({ relativeSeconds: 10, seeking: false });
    expect(controller.seeking({ relativeSeconds: 80 })).toEqual({
      uiState: "seeking",
      pendingReposition: true,
    });
    expect(controller.seeked({ relativeSeconds: 14, paused: false })).toEqual({
      uiState: "playing",
      pendingReposition: false,
    });

    runCallback();

    expect(starts).toEqual([]);
    expect(controller.pending()).toBe(false);
    expect(controller.lastPlaybackTime()).toBe(104);
  });
});
