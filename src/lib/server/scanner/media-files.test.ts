import { describe, expect, test } from "bun:test";
import {
  isSidecarSubtitlePath,
  isVideoFilePath,
  sidecarSubtitleMimeType,
  SUPPORTED_SIDECAR_SUBTITLE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
} from "./media-files";

describe("media file helpers", () => {
  test("keeps supported movie video extensions explicit and case-insensitive", () => {
    expect(SUPPORTED_VIDEO_EXTENSIONS).toEqual([".mp4", ".mkv", ".mov", ".avi", ".webm"]);
    expect(isVideoFilePath("/movies/The.Matrix.1999.MKV")).toBe(true);
    expect(isVideoFilePath("/movies/The.Matrix.1999.srt")).toBe(false);
    expect(isVideoFilePath("/movies/The.Matrix.1999")).toBe(false);
  });

  test("identifies sidecar subtitle extensions separately from media files", () => {
    expect(SUPPORTED_SIDECAR_SUBTITLE_EXTENSIONS).toEqual([".vtt", ".srt"]);
    expect(isSidecarSubtitlePath("/movies/The.Matrix.1999.en.VTT")).toBe(true);
    expect(isSidecarSubtitlePath("/movies/The.Matrix.1999.en.srt")).toBe(true);
    expect(isSidecarSubtitlePath("/movies/The.Matrix.1999.en.ass")).toBe(false);
  });

  test("maps sidecar subtitle extensions to mime types", () => {
    expect(sidecarSubtitleMimeType("/movies/Movie.en.vtt")).toBe("text/vtt");
    expect(sidecarSubtitleMimeType("/movies/Movie.en.SRT")).toBe("application/x-subrip");
  });
});
