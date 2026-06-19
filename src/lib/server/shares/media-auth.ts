import { SIGNED_PLAYBACK_TOKEN_QUERY_PARAM, verifySignedPlaybackToken } from "$lib/server/playback/signed-token";
import { SHARE_TOKEN_QUERY_PARAM } from "$lib/shares/constants";
import { verifyShareMediaAccess, verifySharePlaybackSessionAccess, verifyShareSubtitleAccess } from "./access";

export type MediaAuthResult = {
  userId: string;
  signed: boolean;
};

function queryParam(url: URL | undefined, name: string) {
  return url?.searchParams.get(name) ?? null;
}

export async function authorizeDirectMediaStream(input: {
  localsUserId?: string;
  mediaFileId: string;
  url?: URL;
}): Promise<MediaAuthResult | null> {
  if (input.localsUserId) {
    return { userId: input.localsUserId, signed: false };
  }

  const shareToken = queryParam(input.url, SHARE_TOKEN_QUERY_PARAM);
  if (shareToken) {
    const shareAuth = await verifyShareMediaAccess({
      token: shareToken,
      mediaFileId: input.mediaFileId,
    });
    if (shareAuth) return { userId: shareAuth.userId, signed: true };
  }

  const remoteToken = queryParam(input.url, SIGNED_PLAYBACK_TOKEN_QUERY_PARAM);
  const payload = verifySignedPlaybackToken(remoteToken, {
    route: "direct",
    mediaFileId: input.mediaFileId,
  });
  return payload ? { userId: payload.userId, signed: true } : null;
}

export async function authorizeSubtitleMedia(input: {
  localsUserId?: string;
  subtitleTrackId: string;
  url?: URL;
}): Promise<MediaAuthResult | null> {
  if (input.localsUserId) {
    return { userId: input.localsUserId, signed: false };
  }

  const shareToken = queryParam(input.url, SHARE_TOKEN_QUERY_PARAM);
  if (shareToken) {
    const shareAuth = await verifyShareSubtitleAccess({
      token: shareToken,
      subtitleTrackId: input.subtitleTrackId,
    });
    if (shareAuth) return { userId: shareAuth.userId, signed: true };
  }

  const remoteToken = queryParam(input.url, SIGNED_PLAYBACK_TOKEN_QUERY_PARAM);
  const payload = verifySignedPlaybackToken(remoteToken, {
    route: "subtitle",
    subtitleTrackId: input.subtitleTrackId,
  });
  return payload ? { userId: payload.userId, signed: true } : null;
}

export async function authorizePlaybackSessionMedia(input: {
  localsUserId?: string;
  playbackSessionId: string;
  url?: URL;
}): Promise<MediaAuthResult | null> {
  if (input.localsUserId) {
    return { userId: input.localsUserId, signed: false };
  }

  const shareToken = queryParam(input.url, SHARE_TOKEN_QUERY_PARAM);
  if (shareToken) {
    const shareAuth = await verifySharePlaybackSessionAccess({
      token: shareToken,
      playbackSessionId: input.playbackSessionId,
    });
    if (shareAuth) return { userId: shareAuth.userId, signed: true };
  }

  const remoteToken = queryParam(input.url, SIGNED_PLAYBACK_TOKEN_QUERY_PARAM);
  const payload = verifySignedPlaybackToken(remoteToken, {
    route: "hls",
    playbackSessionId: input.playbackSessionId,
  });
  return payload ? { userId: payload.userId, signed: true } : null;
}
