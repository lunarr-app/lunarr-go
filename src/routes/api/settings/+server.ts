import { requireJsonAdmin } from "$lib/server/api";
import { PUBLIC_TMDB_ACCESS_TOKEN } from "$lib/server/metadata/public-token";
import { getBooleanSetting, getSetting } from "$lib/server/settings";
import { getServerStatus } from "$lib/server/status";
import { getTranscodePolicy } from "$lib/server/transcoding/policy";
import {
  getPlaybackSessionArtifactMaxBytes,
  PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS,
} from "$lib/server/transcoding/sessions";
import { APP_VERSION } from "$lib/server/version";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const savedAccessToken = await getSetting("tmdb_access_token");
  const savedApiKey = await getSetting("tmdb_api_key");
  const fallbackConfigured = Boolean(PUBLIC_TMDB_ACCESS_TOKEN);

  return json({
    signupOpen: await getBooleanSetting("signup_open", false),
    tmdbConfigured: Boolean(savedAccessToken || savedApiKey || fallbackConfigured),
    tmdbAccessTokenConfigured: Boolean(savedAccessToken),
    tmdbAccessTokenSaved: Boolean(savedAccessToken),
    tmdbApiKeyConfigured: Boolean(savedApiKey),
    tmdbApiKeySaved: Boolean(savedApiKey),
    transcodePolicy: await getTranscodePolicy(user.id),
    playbackSessionArtifactMaxBytes: await getPlaybackSessionArtifactMaxBytes(),
    playbackSessionArtifactMaxBytesOptions: PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS,
    version: APP_VERSION,
    status: await getServerStatus(),
  });
};
