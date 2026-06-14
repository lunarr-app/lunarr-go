import { createHmac, timingSafeEqual } from "node:crypto";
import { appEnv } from "$lib/server/config/env";

export const SIGNED_PLAYBACK_TOKEN_QUERY_PARAM = "remoteToken";
export const SIGNED_PLAYBACK_TOKEN_TTL_SECONDS = 8 * 60 * 60;

export type SignedPlaybackRoute = "direct" | "hls" | "subtitle";

export type SignedPlaybackTokenPayload = {
  v: 1;
  route: SignedPlaybackRoute;
  userId: string;
  mediaFileId: string;
  playbackSessionId?: string;
  subtitleTrackId?: string;
  exp: number;
};

type SignedPlaybackTokenInput = Omit<
  SignedPlaybackTokenPayload,
  "v" | "exp"
> & {
  expiresInSeconds?: number;
};

type SignedPlaybackTokenExpectation = {
  route: SignedPlaybackRoute;
  mediaFileId?: string;
  playbackSessionId?: string;
  subtitleTrackId?: string;
};

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string) {
  return createHmac("sha256", appEnv.AUTH_SECRET)
    .update(payload)
    .digest("base64url");
}

function safeSignatureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "base64url");
  const rightBuffer = Buffer.from(right, "base64url");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isSignedPlaybackTokenPayload(
  value: unknown,
): value is SignedPlaybackTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.v === 1 &&
    (payload.route === "direct" ||
      payload.route === "hls" ||
      payload.route === "subtitle") &&
    typeof payload.userId === "string" &&
    typeof payload.mediaFileId === "string" &&
    typeof payload.exp === "number" &&
    (payload.playbackSessionId === undefined ||
      typeof payload.playbackSessionId === "string") &&
    (payload.subtitleTrackId === undefined ||
      typeof payload.subtitleTrackId === "string")
  );
}

export function createSignedPlaybackToken(input: SignedPlaybackTokenInput) {
  const payload: SignedPlaybackTokenPayload = {
    v: 1,
    route: input.route,
    userId: input.userId,
    mediaFileId: input.mediaFileId,
    playbackSessionId: input.playbackSessionId,
    subtitleTrackId: input.subtitleTrackId,
    exp:
      Math.floor(Date.now() / 1000) +
      (input.expiresInSeconds ?? SIGNED_PLAYBACK_TOKEN_TTL_SECONDS),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySignedPlaybackToken(
  token: string | null | undefined,
  expected: SignedPlaybackTokenExpectation,
) {
  if (!token) return null;
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) return null;
  if (!safeSignatureEqual(signature, sign(encodedPayload))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }
  if (!isSignedPlaybackTokenPayload(parsed)) return null;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  if (parsed.route !== expected.route) return null;
  if (expected.mediaFileId && parsed.mediaFileId !== expected.mediaFileId) {
    return null;
  }
  if (
    expected.playbackSessionId &&
    parsed.playbackSessionId !== expected.playbackSessionId
  ) {
    return null;
  }
  if (
    expected.subtitleTrackId &&
    parsed.subtitleTrackId !== expected.subtitleTrackId
  ) {
    return null;
  }

  return parsed;
}

export function appendSignedPlaybackToken(pathname: string, token: string) {
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}${SIGNED_PLAYBACK_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`;
}

export function absoluteSignedPlaybackUrl(pathname: string, token: string) {
  return new URL(
    appendSignedPlaybackToken(pathname, token),
    appEnv.ORIGIN,
  ).toString();
}

export function signedPlaybackSegmentQuery(token: string | null | undefined) {
  return token
    ? `?${SIGNED_PLAYBACK_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`
    : "";
}

export function signedPlaybackCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "Range, Accept, Origin",
    "access-control-expose-headers":
      "Accept-Ranges, Content-Length, Content-Range, Content-Type",
  };
}

export function withSignedPlaybackHeaders(response: Response, enabled: boolean) {
  if (!enabled) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(signedPlaybackCorsHeaders())) {
    headers.set(key, value);
  }
  headers.set("cache-control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function signedPlaybackOptionsResponse() {
  return new Response(null, {
    status: 204,
    headers: signedPlaybackCorsHeaders(),
  });
}
