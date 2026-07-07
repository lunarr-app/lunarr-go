import { describe, expect, test } from "bun:test";
import type { PlaybackSegment } from "$lib/server/playback";
import { activePlaybackSegment, segmentSkipLabel, segmentSkipTargetSeconds } from "./segments";

const segments: PlaybackSegment[] = [
  {
    type: "intro",
    startSeconds: 10,
    endSeconds: 40,
    label: segmentSkipLabel("intro"),
  },
];

describe("playback segment helpers", () => {
  test("shows the skip button from segment start until a couple seconds before end", () => {
    expect(activePlaybackSegment(segments, 8)).toBeNull();
    expect(activePlaybackSegment(segments, 10)).toEqual(segments[0]);
    expect(activePlaybackSegment(segments, 25)).toEqual(segments[0]);
    expect(activePlaybackSegment(segments, 37)).toEqual(segments[0]);
    expect(activePlaybackSegment(segments, 38)).toBeNull();
    expect(activePlaybackSegment(segments, 40)).toBeNull();
  });

  test("uses file duration for open-ended segments when hiding before end", () => {
    const credits: PlaybackSegment[] = [
      {
        type: "credits",
        startSeconds: 100,
        endSeconds: null,
        label: segmentSkipLabel("credits"),
      },
    ];

    expect(activePlaybackSegment(credits, 99, 120)).toBeNull();
    expect(activePlaybackSegment(credits, 100, 120)).toEqual(credits[0]);
    expect(activePlaybackSegment(credits, 117, 120)).toEqual(credits[0]);
    expect(activePlaybackSegment(credits, 118, 120)).toBeNull();
  });

  test("chooses the segment end as the skip target", () => {
    expect(segmentSkipTargetSeconds(segments[0], 120)).toBe(40);
    expect(
      segmentSkipTargetSeconds(
        {
          type: "credits",
          startSeconds: 100,
          endSeconds: null,
          label: segmentSkipLabel("credits"),
        },
        120,
      ),
    ).toBe(120);
  });
});
