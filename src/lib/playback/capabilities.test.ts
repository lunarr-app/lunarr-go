import { describe, expect, test } from "bun:test";
import {
  appendClientPlaybackCapabilityParams,
  appendWebPlaybackApiParamsFromPage,
  detectClientPlaybackCapabilities,
  emptyClientPlaybackCapabilities,
  normalizePlaybackTarget,
  parseClientPlaybackCapabilities,
  webPlaybackApiPath,
} from "./capabilities";

describe("client playback capabilities", () => {
  test("defaults every optional browser capability to false", () => {
    expect(emptyClientPlaybackCapabilities()).toEqual({
      hevc: false,
      av1: false,
      vp9: false,
      vp8: false,
      opus: false,
      vorbis: false,
      webm: false,
      hlsFmp4: false,
      hlsNative: false,
    });
  });

  test("detects codec hints from browser canPlayType responses", () => {
    const positiveTypes = new Set([
      'video/mp4; codecs="hvc1.1.6.L93.B0"',
      'video/mp4; codecs="av01.0.08M.08, mp4a.40.2"',
      'video/webm; codecs="vp9, opus"',
      'video/webm; codecs="vp8, vorbis"',
      'audio/ogg; codecs="opus"',
      'audio/ogg; codecs="vorbis"',
      "video/webm",
      "application/vnd.apple.mpegurl",
    ]);

    expect(detectClientPlaybackCapabilities((type) => (positiveTypes.has(type) ? "probably" : ""))).toEqual({
      hevc: true,
      av1: true,
      vp9: true,
      vp8: true,
      opus: true,
      vorbis: true,
      webm: true,
      hlsFmp4: true,
      hlsNative: true,
    });
  });

  test("detects fMP4 HLS support from MediaSource when native HLS is absent", () => {
    const capabilities = detectClientPlaybackCapabilities(() => "", {
      mediaSourceSupported: true,
    });

    expect(capabilities.hlsFmp4).toBe(true);
    expect(capabilities.hlsNative).toBe(false);
  });

  test("appends only positive capability hints to API requests", () => {
    const params = new URLSearchParams();

    appendClientPlaybackCapabilityParams(params, {
      hevc: true,
      av1: false,
      webm: true,
      hlsFmp4: true,
    });

    expect(params.toString()).toBe("hevc=1&webm=1&hlsFmp4=1");
  });

  test("normalizes playback targets and defaults unknown values to web", () => {
    expect(normalizePlaybackTarget("native")).toBe("native");
    expect(normalizePlaybackTarget("cast")).toBe("cast");
    expect(normalizePlaybackTarget("vlc")).toBe("web");
    expect(normalizePlaybackTarget(null)).toBe("web");
  });

  test("parses client capability hints from playback API query params", () => {
    expect(
      parseClientPlaybackCapabilities(
        new URL("http://localhost/api/playback/movie-1?hevc=1&av1=true&webm=probably&vp9=0"),
      ),
    ).toEqual({
      hevc: true,
      av1: true,
      vp9: false,
      vp8: false,
      opus: false,
      vorbis: false,
      webm: true,
      hlsFmp4: false,
      hlsNative: false,
    });
  });

  test("forwards cast and airplay targets but not native for web playback API requests", () => {
    const nativeParams = new URLSearchParams();
    appendWebPlaybackApiParamsFromPage(
      nativeParams,
      new URL("http://localhost/movies/movie-1?play=movie-1&file=file-b&target=native&start=30"),
    );
    expect(nativeParams.toString()).toBe("file=file-b&start=30");

    const castParams = new URLSearchParams();
    appendWebPlaybackApiParamsFromPage(
      castParams,
      new URL("http://localhost/movies/movie-1?play=movie-1&target=cast&transcode=1"),
    );
    expect(castParams.toString()).toBe("transcode=1&target=cast");
  });

  test("builds the playback API path for a media item", () => {
    expect(webPlaybackApiPath("movie-1")).toBe("/api/playback/movie-1");
    expect(webPlaybackApiPath("movie/special")).toBe("/api/playback/movie%2Fspecial");
  });
});
