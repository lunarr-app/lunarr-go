import { describe, expect, test } from "bun:test";
import { shouldReactToLibraryWatchEvent, shouldWatchLibrary } from "./watchers";

describe("library scan watchers", () => {
  test("reacts to supported media and subtitle paths", () => {
    expect(shouldReactToLibraryWatchEvent("/movies/The Matrix (1999)/The Matrix.mkv")).toBe(true);
    expect(shouldReactToLibraryWatchEvent("/movies/The Matrix (1999)/The Matrix.en.vtt")).toBe(true);
    expect(shouldReactToLibraryWatchEvent("/movies/The Matrix (1999)/The Matrix.en.srt")).toBe(true);
    expect(shouldReactToLibraryWatchEvent("/movies/The Matrix (1999)")).toBe(true);
  });

  test("ignores unsupported file paths and known generated fixture cache paths", () => {
    expect(shouldReactToLibraryWatchEvent("/movies/The Matrix (1999)/poster.jpg")).toBe(false);
    expect(shouldReactToLibraryWatchEvent("/movies/.sample-video-cache/sample.mp4")).toBe(false);
  });

  test("watches local movie and TV libraries", () => {
    expect(shouldWatchLibrary({ kind: "movie", source: "local" })).toBe(true);
    expect(shouldWatchLibrary({ kind: "tv", source: "local" })).toBe(true);
    expect(shouldWatchLibrary({ kind: "movie", source: "local", watch_enabled: 0 })).toBe(false);
    expect(shouldWatchLibrary({ kind: "tv", source: "sftp" })).toBe(false);
    expect(shouldWatchLibrary({ kind: "tv", source: "webdav" })).toBe(false);
  });
});
