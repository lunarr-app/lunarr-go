export type PlaybackSessionTransport = "beacon" | "fetch" | "unavailable";

export type PlaybackSessionLike = {
  mode: string;
  playbackSessionId?: string | null;
};

type BeaconNavigator = {
  sendBeacon?: (url: string, data?: BodyInit | null) => boolean;
};

type KeepaliveFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function activePlaybackSessionId(playback: PlaybackSessionLike) {
  if (
    (playback.mode !== "transcode" && playback.mode !== "remux") ||
    !playback.playbackSessionId
  )
    return null;
  return playback.playbackSessionId;
}

export function postWithBeaconFallback(input: {
  url: string;
  body?: BodyInit | null;
  headers?: HeadersInit;
  navigatorRef?: BeaconNavigator;
  fetchFn?: KeepaliveFetch;
}): PlaybackSessionTransport {
  const body = input.body ?? null;
  if (input.navigatorRef?.sendBeacon?.(input.url, body)) return "beacon";

  if (!input.fetchFn) return "unavailable";
  void input
    .fetchFn(input.url, {
      method: "POST",
      headers: input.headers,
      body,
      keepalive: true
    })
    .catch(() => undefined);
  return "fetch";
}

export function cancelPlaybackSessionOnce(input: {
  playback: PlaybackSessionLike;
  cancelledPlaybackSessions: Set<string>;
  navigatorRef?: BeaconNavigator;
  fetchFn?: KeepaliveFetch;
}) {
  const sessionId = activePlaybackSessionId(input.playback);
  if (!sessionId) return "inactive";
  if (input.cancelledPlaybackSessions.has(sessionId)) return "duplicate";
  input.cancelledPlaybackSessions.add(sessionId);

  return postWithBeaconFallback({
    url: `/api/playback-sessions/${encodeURIComponent(sessionId)}/cancel`,
    body: new Blob([], { type: "application/json" }),
    navigatorRef: input.navigatorRef,
    fetchFn: input.fetchFn
  });
}

export function shouldCancelCapturedPlaybackSession(input: {
  captured: PlaybackSessionLike;
  current: PlaybackSessionLike;
}) {
  const capturedSessionId = activePlaybackSessionId(input.captured);
  if (!capturedSessionId) return false;
  return activePlaybackSessionId(input.current) !== capturedSessionId;
}

export function shouldInvalidateAfterHeartbeat(input: {
  ok: boolean;
  sessionId: string;
  cancelledPlaybackSessions: Set<string>;
  requestPathname: string;
  requestSearch: string;
  currentPathname: string;
  currentSearch: string;
}) {
  if (input.ok) return false;
  if (input.cancelledPlaybackSessions.has(input.sessionId)) return false;
  return (
    input.currentPathname === input.requestPathname &&
    input.currentSearch === input.requestSearch
  );
}
