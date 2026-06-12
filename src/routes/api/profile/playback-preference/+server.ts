import { jsonError, readJsonBody, requireJsonUser } from "$lib/server/api";
import {
  normalizePlaybackPreference,
  setUserPlaybackPreference,
  setUserPreferredAudioLanguage,
  setUserPreferredSubtitleLanguage,
} from "$lib/server/transcoding/policy";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const preference =
      typeof body === "object" && body
        ? (body as { playbackPreference?: unknown }).playbackPreference
        : "";
    const preferredAudioLanguage =
      typeof body === "object" && body
        ? (body as { preferredAudioLanguage?: unknown }).preferredAudioLanguage
        : "";
    const preferredSubtitleLanguage =
      typeof body === "object" && body
        ? (body as { preferredSubtitleLanguage?: unknown })
            .preferredSubtitleLanguage
        : "";
    await setUserPlaybackPreference(
      user.id,
      normalizePlaybackPreference(String(preference ?? "")),
    );
    await setUserPreferredAudioLanguage(
      user.id,
      String(preferredAudioLanguage ?? ""),
    );
    await setUserPreferredSubtitleLanguage(
      user.id,
      String(preferredSubtitleLanguage ?? ""),
    );
    return json({ ok: true });
  } catch (error) {
    return jsonError(error, "Could not update playback preference.");
  }
};
