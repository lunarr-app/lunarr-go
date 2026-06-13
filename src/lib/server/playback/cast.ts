import { createHmac, timingSafeEqual } from "node:crypto";
import { appEnv } from "$lib/server/config/env";

export const CAST_TOKEN_QUERY_PARAM = "castToken";
export const CAST_PLAYBACK_TOKEN_TTL_SECONDS = 8 * 60 * 60;

export type CastPlaybackRoute = "direct" | "hls" | "subtitle";

export type CastPlaybackTokenPayload = {
  v: 1;
  route: CastPlaybackRoute;
  userId: string;
  mediaFileId: string;
  playbackSessionId?: string;
  subtitleTrackId?: string;
  exp: number;
};

type CastPlaybackTokenInput = Omit<CastPlaybackTokenPayload, "v" | "exp"> & {
  expiresInSeconds?: number;
};

type CastPlaybackTokenExpectation = {
  route: CastPlaybackRoute;
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

function isCastPlaybackTokenPayload(
  value: unknown,
): value is CastPlaybackTokenPayload {
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

export function createCastPlaybackToken(input: CastPlaybackTokenInput) {
  const payload: CastPlaybackTokenPayload = {
    v: 1,
    route: input.route,
    userId: input.userId,
    mediaFileId: input.mediaFileId,
    playbackSessionId: input.playbackSessionId,
    subtitleTrackId: input.subtitleTrackId,
    exp: Math.floor(Date.now() / 1000) +
      (input.expiresInSeconds ?? CAST_PLAYBACK_TOKEN_TTL_SECONDS),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyCastPlaybackToken(
  token: string | null | undefined,
  expected: CastPlaybackTokenExpectation,
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
  if (!isCastPlaybackTokenPayload(parsed)) return null;
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

export function appendCastToken(pathname: string, token: string) {
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}${CAST_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`;
}

export function absoluteCastUrl(pathname: string, token: string) {
  return new URL(appendCastToken(pathname, token), appEnv.ORIGIN).toString();
}

export function castSegmentQuery(token: string | null | undefined) {
  return token
    ? `?${CAST_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`
    : "";
}

export function castCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "Range, Accept, Origin",
    "access-control-expose-headers":
      "Accept-Ranges, Content-Length, Content-Range, Content-Type",
  };
}

export function withCastCors(response: Response, enabled: boolean) {
  if (!enabled) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(castCorsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function castOptionsResponse() {
  return new Response(null, {
    status: 204,
    headers: castCorsHeaders(),
  });
}
