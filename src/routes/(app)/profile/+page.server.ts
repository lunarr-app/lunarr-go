import { auth } from "$lib/server/auth";
import {
  createApiKey,
  isApiKeyUnauthorized,
  listApiKeys,
  revokeApiKey as revokePersonalApiKey,
  apiKeyHttpStatus,
} from "$lib/server/auth/api-keys";
import {
  getTranscodePolicy,
  normalizePlaybackPreference,
  setUserPlaybackPreference,
  setUserPreferredAudioLanguage,
  setUserPreferredSubtitleLanguage,
} from "$lib/server/transcoding/policy";
import { buildLinkDevicePath, readLinkDevicePrefill } from "$lib/device-pairing/url";
import { devicePairingApiKeyExpirySettings } from "$lib/server/device-pairing/env";
import {
  getContinueMaxAgeDays,
  normalizeContinueMaxAgeDays,
  setUserContinueMaxAgeDays,
} from "$lib/server/media/continue-max-age";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, request, url }) => {
  if (!locals.user) throw error(401, "Unauthorized");

  const prefill = readLinkDevicePrefill(url);
  if (prefill.initialUserCode) {
    throw redirect(
      303,
      buildLinkDevicePath({
        userCode: prefill.initialUserCode,
        deviceName: prefill.initialDeviceName,
      }),
    );
  }

  let apiKeys;
  try {
    apiKeys = await listApiKeys(request.headers);
  } catch (loadError) {
    if (isApiKeyUnauthorized(loadError)) throw error(401, "Unauthorized");
    throw loadError;
  }

  return {
    user: locals.user,
    apiKeys,
    transcodePolicy: await getTranscodePolicy(locals.user.id),
    continueMaxAgeDays: await getContinueMaxAgeDays(locals.user.id),
    devicePairingApiKeyExpiry: devicePairingApiKeyExpirySettings(),
  };
};

function authErrorMessage(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
}

export const actions: Actions = {
  updateAccount: async ({ request, locals }) => {
    if (!locals.user)
      return fail(401, {
        accountError: "Sign in to update your account.",
      });

    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();

    if (!name) {
      return fail(400, {
        name,
        accountError: "Name is required.",
      });
    }

    try {
      await auth.api.updateUser({
        body: { name },
        headers: request.headers,
      });
    } catch (error) {
      return fail(400, {
        name,
        accountError: authErrorMessage(error, "Could not update account."),
      });
    }

    throw redirect(303, "/profile");
  },
  changePassword: async ({ request, locals }) => {
    if (!locals.user)
      return fail(401, {
        passwordError: "Sign in to change your password.",
      });

    const form = await request.formData();
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (!currentPassword || !newPassword) {
      return fail(400, {
        passwordError: "Current and new password are required.",
      });
    }

    if (newPassword.length < 8) {
      return fail(400, {
        passwordError: "New password must be at least 8 characters.",
      });
    }

    if (newPassword !== confirmPassword) {
      return fail(400, {
        passwordError: "New passwords do not match.",
      });
    }

    try {
      await auth.api.changePassword({
        body: { currentPassword, newPassword },
        headers: request.headers,
      });
    } catch (error) {
      return fail(400, {
        passwordError: authErrorMessage(error, "Could not change password."),
      });
    }

    throw redirect(303, "/profile");
  },
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
    await setUserPreferredAudioLanguage(locals.user.id, String(form.get("preferredAudioLanguage") ?? ""));
    await setUserPreferredSubtitleLanguage(locals.user.id, String(form.get("preferredSubtitleLanguage") ?? ""));

    throw redirect(303, "/profile");
  },
  saveContinueMaxAge: async ({ request, locals }) => {
    if (!locals.user)
      return fail(401, {
        continueMaxAgeError: "Sign in to update continue settings.",
      });

    const form = await request.formData();
    await setUserContinueMaxAgeDays(
      locals.user.id,
      normalizeContinueMaxAgeDays(String(form.get("continueMaxAgeDays") ?? "")),
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
    if (expiresPreset === "custom" && !customExpiresIn) {
      return fail(400, {
        apiKeyError: "Expiration must be a positive number of seconds.",
      });
    }
    const expiresIn = expiresPreset === "custom" ? customExpiresIn : expiresPreset;

    try {
      const created = await createApiKey({
        headers: request.headers,
        name: String(form.get("name") ?? ""),
        expiresIn,
      });

      return {
        apiKeySuccess: "API key created. Copy it now. It will not be shown again.",
        createdApiKey: created.apiKey,
        createdApiKeyToken: created.token,
      };
    } catch (error) {
      return fail(apiKeyHttpStatus(error), {
        apiKeyError: error instanceof Error ? error.message : "Could not create API key.",
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

    if (
      !(await revokePersonalApiKey({
        headers: request.headers,
        apiKeyId,
      }))
    ) {
      return fail(404, { apiKeyError: "API key not found." });
    }

    throw redirect(303, "/profile");
  },
};
