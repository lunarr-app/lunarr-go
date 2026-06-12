import { describe, expect, test } from "bun:test";
import {
  appendClientPlaybackCapabilityParams,
  detectClientPlaybackCapabilities,
  emptyClientPlaybackCapabilities,
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

    expect(
      detectClientPlaybackCapabilities((type) =>
        positiveTypes.has(type) ? "probably" : "",
      ),
    ).toEqual({
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
});
