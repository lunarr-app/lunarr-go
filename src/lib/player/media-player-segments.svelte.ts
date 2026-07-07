import { browser } from "$app/environment";
import {
  activePlaybackSegment,
  playbackSegmentKey,
  SEGMENT_LABELS,
  segmentSkipTargetSeconds,
} from "$lib/playback/segments";
import type { PlaybackData, PlaybackSegment } from "$lib/server/playback";

export type MediaPlayerSegmentsDeps = {
  getData: () => PlaybackData;
  getDisplayedPlaybackSeconds: () => number;
  getDurationSeconds: () => number | null;
  getVideo: () => HTMLVideoElement | undefined;
  isCasting: () => boolean;
  getCastLaunchState: () => "idle" | "connecting" | "connected" | "error";
  seekToPlaybackSeconds: (targetSeconds: number) => void;
};

export function createMediaPlayerSegments(deps: MediaPlayerSegmentsDeps) {
  const activeSegment = $derived.by(() => {
    const data = deps.getData();
    if (!data.segmentSkip.enabled) return null;
    return activePlaybackSegment(data.segments, deps.getDisplayedPlaybackSeconds(), deps.getDurationSeconds());
  });

  let autoSkippedSegmentKeys = $state(new Set<string>());
  let autoSkipNotice = $state<string | null>(null);
  let autoSkipNoticeTimeout: number | null = null;

  const AUTO_SKIP_NOTICE_MS = 3200;

  function clearAutoSkipNotice() {
    autoSkipNotice = null;
    if (autoSkipNoticeTimeout !== null) {
      window.clearTimeout(autoSkipNoticeTimeout);
      autoSkipNoticeTimeout = null;
    }
  }

  function showAutoSkipNotice(message: string) {
    autoSkipNotice = message;
    if (autoSkipNoticeTimeout !== null) {
      window.clearTimeout(autoSkipNoticeTimeout);
    }
    autoSkipNoticeTimeout = window.setTimeout(() => {
      autoSkipNotice = null;
      autoSkipNoticeTimeout = null;
    }, AUTO_SKIP_NOTICE_MS);
  }

  function skipActiveSegment() {
    const segment = activeSegment;
    if (!segment) return;
    deps.seekToPlaybackSeconds(segmentSkipTargetSeconds(segment, deps.getDurationSeconds()));
  }

  function runSegmentEffects() {
    $effect(() => {
      const mediaItemId = deps.getData().item.id;
      void mediaItemId;
      autoSkippedSegmentKeys = new Set();
      clearAutoSkipNotice();
    });

    $effect(() => {
      if (!browser || !deps.getData().segmentSkip.enabled || !deps.getData().segmentSkip.automatic) return;
      const segment = activeSegment;
      if (!segment) return;
      if (deps.getCastLaunchState() === "connecting") return;
      if (!deps.getVideo() && !deps.isCasting()) return;
      const key = playbackSegmentKey(segment);
      if (autoSkippedSegmentKeys.has(key)) return;
      autoSkippedSegmentKeys = new Set([...autoSkippedSegmentKeys, key]);
      showAutoSkipNotice(SEGMENT_LABELS[segment.type].skipped);
      skipActiveSegment();
    });
  }

  function destroy() {
    clearAutoSkipNotice();
  }

  return {
    get activeSegment(): PlaybackSegment | null {
      return activeSegment;
    },
    get autoSkipNotice() {
      return autoSkipNotice;
    },
    skipActiveSegment,
    runSegmentEffects,
    destroy,
  };
}
