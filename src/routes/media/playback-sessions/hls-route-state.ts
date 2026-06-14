import { getTranscodePolicy } from "$lib/server/transcoding/policy";
import { cancelPlaybackSession, TRANSCODING_DISABLED_MESSAGE } from "$lib/server/transcoding/manager";
import {
  getAuthorizedHlsArtifact,
  isEndedPlaybackArtifactFresh,
  type AuthorizedHlsArtifact,
} from "$lib/server/transcoding/sessions";
import { normalizePlaybackSessionMessage } from "$lib/server/transcoding/messages";
import { json } from "@sveltejs/kit";

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
  if (!artifact) return json({ error: "Not found" }, { status: 404 });

  if (artifact.status === "cancelled") {
    return (
      options.cancelledResponse?.(artifact) ??
      json(
        {
          error: playbackRouteError(artifact.errorMessage ?? "Playback session is not playable."),
        },
        { status: 409 },
      )
    );
  }
  if (artifact.status === "failed") {
    return json(
      {
        error: playbackRouteError(artifact.errorMessage ?? "Playback session is not playable."),
      },
      { status: 409 },
    );
  }

  const policy = await getTranscodePolicy(userId);
  if (!policy.transcodingEnabled) {
    await cancelPlaybackSession(sessionId, TRANSCODING_DISABLED_MESSAGE);
    return json({ error: TRANSCODING_DISABLED_MESSAGE }, { status: 409 });
  }

  if (artifact.status !== "running" && artifact.status !== "completed") {
    return json({ error: "Playback session is not ready." }, { status: 409 });
  }
  if (artifact.status === "completed" && !isEndedPlaybackArtifactFresh(artifact)) {
    return json({ error: "Ended playback session is no longer active." }, { status: 410 });
  }
  if (!artifact.playlistPath) {
    return json({ error: "Playback session is not ready." }, { status: 409 });
  }

  return { ...artifact, playlistPath: artifact.playlistPath };
}

export function hlsArtifactChangedResponse(
  current: PlayableHlsArtifact,
  previousPlaylistPath: string,
  artifact: "playlist" | "segment",
) {
  if (current.playlistPath === previousPlaylistPath) return null;
  return json({ error: `Playback session changed while serving ${artifact}.` }, { status: 409 });
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
  return json({ error: input.notReadyMessage ?? "Playback session is not ready." }, { status: 409 });
}
