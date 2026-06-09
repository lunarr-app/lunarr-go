import { describe, expect, test } from "bun:test";
import {
  activePlaybackSessionId,
  cancelPlaybackSessionOnce,
  postWithBeaconFallback,
  shouldCancelCapturedPlaybackSession,
  shouldInvalidateAfterHeartbeat,
} from "./session";

describe("playback session browser helpers", () => {
  test("finds active HLS playback sessions only", () => {
    expect(
      activePlaybackSessionId({
        mode: "transcode",
        playbackSessionId: "playback-session-1",
      }),
    ).toBe("playback-session-1");
    expect(
      activePlaybackSessionId({
        mode: "transcode",
      }),
    ).toBeNull();
    expect(
      activePlaybackSessionId({
        mode: "remux",
        playbackSessionId: "session-2",
      }),
    ).toBe("session-2");
    expect(
      activePlaybackSessionId({
        mode: "direct",
        playbackSessionId: "session-3",
      }),
    ).toBeNull();
    expect(
      activePlaybackSessionId({
        mode: "transcode",
        playbackSessionId: null,
      }),
    ).toBeNull();
  });

  test("uses sendBeacon before keepalive fetch", () => {
    const fetchCalls: RequestInit[] = [];
    const result = postWithBeaconFallback({
      url: "/api/playback/movie-1",
      body: new Blob(["{}"], { type: "application/json" }),
      navigatorRef: {
        sendBeacon(url, data) {
          expect(url).toBe("/api/playback/movie-1");
          expect(data).toBeInstanceOf(Blob);
          return true;
        },
      },
      fetchFn: async (_url, init) => {
        fetchCalls.push(init ?? {});
        return new Response(null, { status: 204 });
      },
    });

    expect(result).toBe("beacon");
    expect(fetchCalls).toHaveLength(0);
  });

  test("falls back to keepalive fetch when sendBeacon cannot queue", () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const result = postWithBeaconFallback({
      url: "/api/playback/movie-1",
      body: new Blob(["{}"], { type: "application/json" }),
      headers: { "content-type": "application/json" },
      navigatorRef: {
        sendBeacon() {
          return false;
        },
      },
      fetchFn: async (input, init) => {
        fetchCalls.push({ input, init });
        return new Response(null, { status: 204 });
      },
    });

    expect(result).toBe("fetch");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toMatchObject({
      input: "/api/playback/movie-1",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
      },
    });
    expect(fetchCalls[0].init?.body).toBeInstanceOf(Blob);
  });

  test("cancels a playback session once across duplicate pagehide/navigation calls", () => {
    const cancelledPlaybackSessions = new Set<string>();
    const beaconCalls: Array<{ url: string; data?: BodyInit | null }> = [];
    const fetchCalls: Array<RequestInfo | URL> = [];
    const input = {
      playback: {
        mode: "transcode",
        playbackSessionId: "session/with space",
      },
      cancelledPlaybackSessions,
      navigatorRef: {
        sendBeacon(url: string, data?: BodyInit | null) {
          beaconCalls.push({ url, data });
          return true;
        },
      },
      fetchFn: async (url: RequestInfo | URL) => {
        fetchCalls.push(url);
        return new Response(null, { status: 204 });
      },
    };

    expect(cancelPlaybackSessionOnce(input)).toBe("beacon");
    expect(cancelPlaybackSessionOnce(input)).toBe("duplicate");
    expect(beaconCalls).toHaveLength(1);
    expect(beaconCalls[0].url).toBe("/api/playback-sessions/session%2Fwith%20space/cancel");
    expect(beaconCalls[0].data).toBeInstanceOf(Blob);
    expect(fetchCalls).toHaveLength(0);
    expect(cancelledPlaybackSessions.has("session/with space")).toBe(true);
  });

  test("does not send cancel for non-HLS playback", () => {
    const fetchCalls: Array<RequestInfo | URL> = [];
    expect(
      cancelPlaybackSessionOnce({
        playback: {
          mode: "direct",
          playbackSessionId: "session-1",
        },
        cancelledPlaybackSessions: new Set<string>(),
        fetchFn: async (url) => {
          fetchCalls.push(url);
          return new Response(null, { status: 204 });
        },
      }),
    ).toBe("inactive");
    expect(fetchCalls).toHaveLength(0);
  });

  test("cancels captured HLS sessions only after the active session changes", () => {
    expect(
      shouldCancelCapturedPlaybackSession({
        captured: { mode: "remux", playbackSessionId: "session-1" },
        current: { mode: "remux", playbackSessionId: "session-1" },
      }),
    ).toBe(false);
    expect(
      shouldCancelCapturedPlaybackSession({
        captured: { mode: "transcode", playbackSessionId: "session-1" },
        current: { mode: "transcode", playbackSessionId: "session-2" },
      }),
    ).toBe(true);
    expect(
      shouldCancelCapturedPlaybackSession({
        captured: { mode: "transcode", playbackSessionId: "session-1" },
        current: { mode: "direct" },
      }),
    ).toBe(true);
    expect(
      shouldCancelCapturedPlaybackSession({
        captured: { mode: "direct" },
        current: { mode: "transcode", playbackSessionId: "session-1" },
      }),
    ).toBe(false);
  });

  test("invalidates failed heartbeat only for the current active page", () => {
    const cancelledPlaybackSessions = new Set<string>();
    const input = {
      ok: false,
      sessionId: "session-1",
      cancelledPlaybackSessions,
      requestPathname: "/movies/movie-1",
      requestSearch: "?file=file-1&transcode=1",
      currentPathname: "/movies/movie-1",
      currentSearch: "?file=file-1&transcode=1",
    };

    expect(shouldInvalidateAfterHeartbeat(input)).toBe(true);
    expect(shouldInvalidateAfterHeartbeat({ ...input, ok: true })).toBe(false);
    cancelledPlaybackSessions.add("session-1");
    expect(shouldInvalidateAfterHeartbeat(input)).toBe(false);
    cancelledPlaybackSessions.clear();
    expect(
      shouldInvalidateAfterHeartbeat({
        ...input,
        currentPathname: "/movies",
        currentSearch: "",
      }),
    ).toBe(false);
    expect(
      shouldInvalidateAfterHeartbeat({
        ...input,
        currentSearch: "?file=file-1&transcode=1&start=40",
      }),
    ).toBe(false);
  });
});
