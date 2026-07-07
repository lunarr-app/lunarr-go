import type { PlaybackSegment, PlaybackSegmentType } from "$lib/server/playback";

const SEGMENT_LEAD_OUT_SECONDS = 2;

export const SEGMENT_LABELS: Record<PlaybackSegmentType, { skip: string; skipped: string }> = {
  intro: { skip: "Skip intro", skipped: "Skipped intro" },
  recap: { skip: "Skip recap", skipped: "Skipped recap" },
  credits: { skip: "Skip credits", skipped: "Skipped credits" },
};

function segmentWindowEnd(segment: PlaybackSegment, durationSeconds: number | null | undefined) {
  const resolvedEnd =
    segment.endSeconds ??
    (Number.isFinite(durationSeconds) && Number(durationSeconds) > 0 ? Number(durationSeconds) : null);
  if (resolvedEnd === null) return Number.POSITIVE_INFINITY;

  return Math.max(segment.startSeconds, resolvedEnd - SEGMENT_LEAD_OUT_SECONDS);
}

export function activePlaybackSegment(segments: PlaybackSegment[], seconds: number, durationSeconds?: number | null) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;

  for (const segment of segments) {
    const windowStart = Math.max(0, segment.startSeconds);
    const windowEnd = segmentWindowEnd(segment, durationSeconds);
    if (seconds >= windowStart && seconds < windowEnd) {
      return segment;
    }
  }

  return null;
}

export function playbackSegmentKey(segment: PlaybackSegment) {
  return `${segment.type}:${segment.startSeconds}:${segment.endSeconds ?? "end"}`;
}

export function segmentSkipTargetSeconds(segment: PlaybackSegment, durationSeconds: number | null | undefined) {
  if (segment.endSeconds !== null && Number.isFinite(segment.endSeconds)) {
    return segment.endSeconds;
  }
  if (Number.isFinite(durationSeconds) && Number(durationSeconds) > 0) {
    return Number(durationSeconds);
  }
  return segment.startSeconds;
}
