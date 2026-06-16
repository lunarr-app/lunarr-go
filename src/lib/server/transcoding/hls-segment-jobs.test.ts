import { describe, expect, test } from "bun:test";
import { requestDrivenSegmentWindow } from "./hls-segment-jobs";

describe("requestDrivenSegmentWindow", () => {
  test("returns a bounded window from the requested segment index", () => {
    expect(
      requestDrivenSegmentWindow({
        durationSeconds: 240,
        segmentIndex: 10,
        segmentSeconds: 16,
        maxSegmentCount: 4,
      }).map((segment) => segment.segment),
    ).toEqual(["segment-00010.ts", "segment-00011.ts", "segment-00012.ts", "segment-00013.ts"]);
  });

  test("stops at end-of-file and shortens the final segment duration", () => {
    const window = requestDrivenSegmentWindow({
      durationSeconds: 13,
      segmentIndex: 0,
      segmentSeconds: 16,
      maxSegmentCount: 4,
    });

    expect(window).toEqual([
      {
        segment: "segment-00000.ts",
        segmentIndex: 0,
        segmentStartSeconds: 0,
        segmentSeconds: 13,
      },
    ]);
  });

  test("uses fMP4 segment names when requested", () => {
    expect(
      requestDrivenSegmentWindow({
        durationSeconds: 64,
        segmentIndex: 2,
        segmentSeconds: 16,
        segmentFormat: "fmp4",
        maxSegmentCount: 2,
      }).map((segment) => segment.segment),
    ).toEqual(["segment-00002.m4s", "segment-00003.m4s"]);
  });

  test("never returns an empty window", () => {
    expect(
      requestDrivenSegmentWindow({
        durationSeconds: 0,
        segmentIndex: 0,
        segmentSeconds: 16,
        maxSegmentCount: 4,
      }),
    ).toEqual([]);
  });
});
