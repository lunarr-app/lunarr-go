import { describe, expect, test } from "bun:test";
import type { MediaRecord } from "theintrodb";
import { clampPlaybackSegments, playbackSegmentsFromMediaRecord } from "./index";

describe("introDb segment normalization", () => {
  test("maps intro and credits timestamps into playback segments", () => {
    const record: MediaRecord = {
      tmdbId: 1396,
      type: "tv",
      season: 1,
      episode: 2,
      intro: [{ startMs: 314500, endMs: 331000, durationMs: 16500, startsAtBeginning: false, endsAtMediaEnd: false }],
      recap: [],
      credits: [{ startMs: 2843000, endMs: null, durationMs: null, startsAtBeginning: false, endsAtMediaEnd: true }],
      preview: [],
    };

    expect(clampPlaybackSegments(playbackSegmentsFromMediaRecord(record), 3000)).toEqual([
      {
        type: "intro",
        startSeconds: 314.5,
        endSeconds: 331,
        label: "Skip intro",
      },
      {
        type: "credits",
        startSeconds: 2843,
        endSeconds: 3000,
        label: "Skip credits",
      },
    ]);
  });

  test("treats null start times as the beginning of media", () => {
    const record: MediaRecord = {
      tmdbId: 1396,
      type: "tv",
      season: 1,
      episode: 1,
      intro: [],
      recap: [{ startMs: 0, endMs: 90000, durationMs: 90000, startsAtBeginning: true, endsAtMediaEnd: false }],
      credits: [],
      preview: [],
    };

    expect(playbackSegmentsFromMediaRecord(record)).toEqual([
      {
        type: "recap",
        startSeconds: 0,
        endSeconds: 90,
        label: "Skip recap",
      },
    ]);
  });
});
