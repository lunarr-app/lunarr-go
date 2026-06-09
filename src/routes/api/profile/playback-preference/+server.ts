import { jsonError, readJsonBody, requireJsonUser } from "$lib/server/api";
import {
  normalizePlaybackPreference,
  setUserPlaybackPreference
} from "$lib/server/transcoding/policy";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const preference = typeof body === "object" && body ? (body as { playbackPreference?: unknown }).playbackPreference : "";
    await setUserPlaybackPreference(user.id, normalizePlaybackPreference(String(preference ?? "")));
    return json({ ok: true });
  } catch (error) {
    return jsonError(error, "Could not update playback preference.");
  }
};
