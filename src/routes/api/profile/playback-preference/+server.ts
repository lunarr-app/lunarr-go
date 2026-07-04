import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse } from "$lib/server/api/types";
import { readJsonBody, requireJsonUser } from "$lib/server/api";
import {
  normalizePlaybackPreference,
  setUserPlaybackPreference,
  setUserPreferredAudioLanguage,
  setUserPreferredSubtitleLanguage,
} from "$lib/server/transcoding/policy";
import type { RequestHandler } from "./$types";

export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const values =
      typeof body === "object" && body
        ? (body as {
            playbackPreference?: unknown;
            preferredAudioLanguage?: unknown;
            preferredSubtitleLanguage?: unknown;
          })
        : {};

    if ("playbackPreference" in values) {
      await setUserPlaybackPreference(user.id, normalizePlaybackPreference(String(values.playbackPreference ?? "")));
    }
    if ("preferredAudioLanguage" in values) {
      await setUserPreferredAudioLanguage(user.id, String(values.preferredAudioLanguage ?? ""));
    }
    if ("preferredSubtitleLanguage" in values) {
      await setUserPreferredSubtitleLanguage(user.id, String(values.preferredSubtitleLanguage ?? ""));
    }
    return apiJson<ApiOkResponse>({ ok: true });
  } catch (error) {
    return apiErrorFrom(error, "Could not update playback preference.");
  }
};
