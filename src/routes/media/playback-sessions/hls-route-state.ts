import { getTranscodePolicy } from "$lib/server/transcoding/policy";
import { cancelPlaybackSession, TRANSCODING_DISABLED_MESSAGE } from "$lib/server/transcoding/manager";
import {
  getAuthorizedHlsArtifact,
  isEndedPlaybackArtifactFresh,
  type AuthorizedHlsArtifact,
} from "$lib/server/transcoding/sessions";
import { normalizePlaybackSessionMessage } from "$lib/server/transcoding/messages";
import { apiError } from "$lib/server/api/json";

export type PlayableHlsArtifact = AuthorizedHlsArtifact & {
  playlistPath: string;
};

type CurrentPlayableHlsArtifactOptions = {
  cancelledResponse?: (artifact: AuthorizedHlsArtifact) => Response | null;
};

export function playbackRouteError(message: string) {
  return normalizePlaybackSessionMessage(message) ?? "";
}

export async function currentPlayableHlsArtifact(
  sessionId: string,
  userId: string,
  options: CurrentPlayableHlsArtifactOptions = {},
): Promise<PlayableHlsArtifact | Response> {
  const artifact = await getAuthorizedHlsArtifact(sessionId, userId);
  if (!artifact) return apiError("Not found", 404);

  if (artifact.status === "cancelled") {
    return (
      options.cancelledResponse?.(artifact) ??
      apiError(playbackRouteError(artifact.errorMessage ?? "Playback session is not playable."), 409)
    );
  }
  if (artifact.status === "failed") {
    return apiError(playbackRouteError(artifact.errorMessage ?? "Playback session is not playable."), 409);
  }

  const policy = await getTranscodePolicy(userId);
  if (!policy.transcodingEnabled) {
    await cancelPlaybackSession(sessionId, TRANSCODING_DISABLED_MESSAGE);
    return apiError(TRANSCODING_DISABLED_MESSAGE, 409);
  }

  if (artifact.status !== "running" && artifact.status !== "completed") {
    return apiError("Playback session is not ready.", 409);
  }
  if (artifact.status === "completed" && !isEndedPlaybackArtifactFresh(artifact)) {
    return apiError("Ended playback session is no longer active.", 410);
  }
  if (!artifact.playlistPath) {
    return apiError("Playback session is not ready.", 409);
  }

  return { ...artifact, playlistPath: artifact.playlistPath };
}

export function hlsArtifactChangedResponse(
  current: PlayableHlsArtifact,
  previousPlaylistPath: string,
  artifact: "playlist" | "segment",
) {
  if (current.playlistPath === previousPlaylistPath) return null;
  return apiError(`Playback session changed while serving ${artifact}.`, 409);
}

export async function currentUnchangedPlayableHlsArtifact(input: {
  sessionId: string;
  userId: string;
  playlistPath: string;
  artifact: "playlist" | "segment";
  options?: CurrentPlayableHlsArtifactOptions;
}): Promise<PlayableHlsArtifact | Response> {
  const current = await currentPlayableHlsArtifact(input.sessionId, input.userId, input.options);
  if (current instanceof Response) return current;
  return hlsArtifactChangedResponse(current, input.playlistPath, input.artifact) ?? current;
}

export async function hlsFailedActivityResponse(input: {
  sessionId: string;
  userId: string;
  playlistPath: string;
  artifact: "playlist" | "segment";
  allowCompleted: boolean;
  notReadyMessage?: string;
  options?: CurrentPlayableHlsArtifactOptions;
}): Promise<Response | null> {
  const current = await currentUnchangedPlayableHlsArtifact(input);
  if (current instanceof Response) return current;
  if (input.allowCompleted && current.status === "completed") return null;
  return apiError(input.notReadyMessage ?? "Playback session is not ready.", 409);
}
