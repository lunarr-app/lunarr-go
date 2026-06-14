import {
  createApiKey,
  listApiKeys,
  revokeApiKey as revokePersonalApiKey,
} from "$lib/server/auth/api-keys";
import {
  getTranscodePolicy,
  normalizePlaybackPreference,
  setUserPlaybackPreference,
  setUserPreferredAudioLanguage,
  setUserPreferredSubtitleLanguage,
} from "$lib/server/transcoding/policy";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw error(401, "Unauthorized");

  return {
    user: locals.user,
    apiKeys: await listApiKeys(locals.user.id),
    transcodePolicy: await getTranscodePolicy(locals.user.id),
  };
};

export const actions: Actions = {
  savePlaybackPreference: async ({ request, locals }) => {
    if (!locals.user)
      return fail(401, {
        playbackPreferenceError: "Sign in to update playback settings.",
      });

    const form = await request.formData();
    await setUserPlaybackPreference(
      locals.user.id,
      normalizePlaybackPreference(String(form.get("playbackPreference") ?? "")),
    );
    await setUserPreferredAudioLanguage(
      locals.user.id,
      String(form.get("preferredAudioLanguage") ?? ""),
    );
    await setUserPreferredSubtitleLanguage(
      locals.user.id,
      String(form.get("preferredSubtitleLanguage") ?? ""),
    );

    throw redirect(303, "/profile");
  },
  createApiKey: async ({ request, locals }) => {
    if (!locals.user)
      return fail(401, {
        apiKeyError: "Sign in to create API keys.",
      });

    const form = await request.formData();
    const expiresPreset = String(form.get("expiresPreset") ?? "");
    const customExpiresIn = String(form.get("expiresIn") ?? "").trim();
    const expiresIn =
      expiresPreset === "custom"
        ? customExpiresIn
        : expiresPreset;

    try {
      const created = await createApiKey({
        userId: locals.user.id,
        name: String(form.get("name") ?? ""),
        expiresIn,
      });

      return {
        apiKeySuccess: "API key created. Copy it now; it will not be shown again.",
        createdApiKey: created.apiKey,
        createdApiKeyToken: created.token,
      };
    } catch (error) {
      return fail(400, {
        apiKeyError:
          error instanceof Error ? error.message : "Could not create API key.",
      });
    }
  },
  revokeApiKey: async ({ request, locals }) => {
    if (!locals.user)
      return fail(401, {
        apiKeyError: "Sign in to revoke API keys.",
      });

    const form = await request.formData();
    const apiKeyId = String(form.get("apiKeyId") ?? "");
    if (!apiKeyId) {
      return fail(400, { apiKeyError: "API key is required." });
    }

    if (!(await revokePersonalApiKey(locals.user.id, apiKeyId))) {
      return fail(404, { apiKeyError: "API key not found." });
    }

    throw redirect(303, "/profile");
  },
};
