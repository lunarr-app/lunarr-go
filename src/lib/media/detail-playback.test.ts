import { describe, expect, test } from "bun:test";
import {
  deriveDetailPlaybackState,
  detailPrimaryActionLabel,
  detailResumeLabel,
  detailResumePercent,
} from "./detail-playback";

const progress = [
  {
    media_file_id: "file-1",
    position_seconds: 192,
    duration_seconds: 2772,
    completed: 0,
    updated_at: "2026-06-15T12:00:00.000Z",
  },
  {
    media_file_id: "file-2",
    position_seconds: 0,
    duration_seconds: 1800,
    completed: 1,
    updated_at: "2026-06-16T12:00:00.000Z",
  },
];

describe("deriveDetailPlaybackState", () => {
  test("prefers the latest incomplete progress for resume", () => {
    const state = deriveDetailPlaybackState([{ id: "file-1" }, { id: "file-2" }], [progress[0]]);

    expect(state.primaryFile?.id).toBe("file-1");
    expect(state.hasCompletedProgress).toBe(false);
    expect(state.primaryActionLabel).toBe("Resume");
    expect(state.resumeLabel).toBe("Resume at 3m 12s of 46m 12s");
    expect(state.resumePercent).toBe(7);
  });

  test("uses completed progress when no resume point exists", () => {
    const state = deriveDetailPlaybackState([{ id: "file-1" }, { id: "file-2" }], [progress[1]]);

    expect(state.primaryFile?.id).toBe("file-2");
    expect(state.hasCompletedProgress).toBe(true);
    expect(state.primaryActionLabel).toBe("Play again");
    expect(state.resumeLabel).toBeNull();
    expect(state.resumePercent).toBe(0);
  });
});

describe("detail playback labels", () => {
  test("formats action and resume helpers", () => {
    const resume = progress[0];
    expect(detailPrimaryActionLabel(resume, false)).toBe("Resume");
    expect(detailPrimaryActionLabel(undefined, true)).toBe("Play again");
    expect(detailPrimaryActionLabel(undefined, false)).toBe("Play");
    expect(detailResumeLabel(resume)).toBe("Resume at 3m 12s of 46m 12s");
    expect(detailResumePercent(resume)).toBe(7);
  });
});
