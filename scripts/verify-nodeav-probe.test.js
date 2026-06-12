import { describe, expect, test } from "bun:test";
import { validateNodeAvProbeSummary } from "./verify-nodeav-probe.mjs";

describe("NodeAV probe verifier", () => {
  test("accepts a probe summary with a container, duration, and video", () => {
    expect(() =>
      validateNodeAvProbeSummary({
        container: "mov,mp4,m4a,3gp,3g2,mj2",
        durationSeconds: 3,
        videoStreamCount: 1,
      }),
    ).not.toThrow();
  });

  test("rejects probe summaries that do not prove video metadata", () => {
    expect(() =>
      validateNodeAvProbeSummary({
        container: "mov,mp4,m4a,3gp,3g2,mj2",
        durationSeconds: 3,
        videoStreamCount: 0,
      }),
    ).toThrow("video stream");
    expect(() =>
      validateNodeAvProbeSummary({
        container: null,
        durationSeconds: 3,
        videoStreamCount: 1,
      }),
    ).toThrow("container");
    expect(() =>
      validateNodeAvProbeSummary({
        container: "mov,mp4,m4a,3gp,3g2,mj2",
        durationSeconds: null,
        videoStreamCount: 1,
      }),
    ).toThrow("positive duration");
  });
});
