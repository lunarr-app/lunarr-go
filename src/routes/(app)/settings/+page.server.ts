import { isAdmin, requireAdmin } from "$lib/server/auth/users";
import { PUBLIC_TMDB_ACCESS_TOKEN } from "$lib/server/metadata/public-token";
import { tmdbCredentialsConfigured } from "$lib/server/metadata/tmdb";
import { getBooleanSetting, getSetting } from "$lib/server/settings";
import {
  runSettingsAction,
  updateMetadataSettings,
  updateRegistrationSettings,
  updateTranscodingSettings,
} from "$lib/server/settings-commands";
import { getServerStatus } from "$lib/server/status";
import { getTranscodePolicy } from "$lib/server/transcoding/policy";
import {
  getPlaybackSessionArtifactMaxBytes,
  PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS,
} from "$lib/server/transcoding/sessions";
import { APP_VERSION } from "$lib/server/version";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);
  const savedAccessToken = await getSetting("tmdb_access_token");
  const savedApiKey = await getSetting("tmdb_api_key");
  const fallbackConfigured = Boolean(PUBLIC_TMDB_ACCESS_TOKEN);
  const tmdbConfigured = Boolean(
    savedAccessToken || savedApiKey || fallbackConfigured,
  );

  return {
    signupOpen: await getBooleanSetting("signup_open", false),
    tmdbConfigured,
    tmdbAccessTokenConfigured: Boolean(savedAccessToken),
    tmdbAccessTokenSaved: Boolean(savedAccessToken),
    tmdbApiKeyConfigured: Boolean(savedApiKey),
    tmdbApiKeySaved: Boolean(savedApiKey),
    transcodePolicy: await getTranscodePolicy(locals.user?.id),
    playbackSessionArtifactMaxBytes: await getPlaybackSessionArtifactMaxBytes(),
    playbackSessionArtifactMaxBytesOptions: PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS,
    version: APP_VERSION,
    status: await getServerStatus(),
  };
};

export const actions: Actions = {
  saveRegistration: async ({ request, locals }) => {
    if (!isAdmin(locals.user))
      return fail(403, {
        registrationError: "Only admins can update registration settings.",
      });

    const form = await request.formData();
    await updateRegistrationSettings(form);

    throw redirect(303, "/settings");
  },
  saveMetadata: async ({ request, locals }) => {
    if (!isAdmin(locals.user))
      return fail(403, {
        metadataSaveError: "Only admins can update metadata settings.",
      });

    const form = await request.formData();
    await updateMetadataSettings(form);

    throw redirect(303, "/settings");
  },
  saveTranscoding: async ({ request, locals }) => {
    if (!isAdmin(locals.user))
      return fail(403, {
        transcodingError: "Only admins can update transcoding settings.",
      });

    const form = await request.formData();
    await updateTranscodingSettings(form);

    throw redirect(303, "/settings");
  },
  refreshMetadata: async ({ locals }) => {
    if (!isAdmin(locals.user))
      return fail(403, { metadataError: "Only admins can refresh metadata." });
    if (!(await tmdbCredentialsConfigured()))
      return fail(400, {
        metadataError: "TMDb credentials are not configured.",
      });

    try {
      return {
        metadataMessage: (
          (await runSettingsAction("refreshMovieMetadata")) as {
            existing: boolean;
          }
        ).existing
          ? "Movie metadata refresh is already running."
          : "Started movie metadata refresh. Track progress in Jobs.",
      };
    } catch (error) {
      return fail(400, {
        metadataError:
          error instanceof Error
            ? error.message
            : "Could not refresh metadata.",
      });
    }
  },
  refreshTvMetadata: async ({ locals }) => {
    if (!isAdmin(locals.user))
      return fail(403, {
        tvMetadataError: "Only admins can refresh TV metadata.",
      });
    if (!(await tmdbCredentialsConfigured()))
      return fail(400, {
        tvMetadataError: "TMDb credentials are not configured.",
      });

    try {
      return {
        tvMetadataMessage: (
          (await runSettingsAction("refreshTvMetadata")) as {
            existing: boolean;
          }
        ).existing
          ? "TV metadata refresh is already running."
          : "Started TV metadata refresh. Track progress in Jobs.",
      };
    } catch (error) {
      return fail(400, {
        tvMetadataError:
          error instanceof Error
            ? error.message
            : "Could not refresh TV metadata.",
      });
    }
  },
  scanAll: async ({ locals }) => {
    if (!isAdmin(locals.user))
      return fail(403, { scanError: "Only admins can scan libraries." });

    try {
      const result = (await runSettingsAction("scanAll")) as {
        jobIds: string[];
        libraries: number;
      };

      return {
        scanMessage: `Started ${result.jobIds.length} scan${result.jobIds.length === 1 ? "" : "s"} for ${result.libraries} ${result.libraries === 1 ? "library" : "libraries"}.`,
      };
    } catch (error) {
      return fail(400, {
        scanError:
          error instanceof Error ? error.message : "Could not start scans.",
      });
    }
  },
  repairMediaProbes: async ({ locals }) => {
    if (!isAdmin(locals.user))
      return fail(403, { probeError: "Only admins can repair media probes." });

    try {
      return {
        probeMessage: (
          (await runSettingsAction("repairMediaProbes")) as {
            existing: boolean;
          }
        ).existing
          ? "Media probe repair is already running."
          : "Started media probe repair. Track progress in Jobs.",
      };
    } catch (error) {
      return fail(400, {
        probeError:
          error instanceof Error
            ? error.message
            : "Could not start media probe repair.",
      });
    }
  },
  testTmdb: async ({ locals }) => {
    if (!isAdmin(locals.user)) {
      return fail(403, {
        tmdbTestMessage: "Only admins can test metadata settings.",
        tmdbTestOk: false,
      });
    }

    try {
      const result = (await runSettingsAction("testTmdb")) as {
        message: string;
        ok: boolean;
      };
      return {
        tmdbTestMessage: result.message,
        tmdbTestOk: result.ok,
      };
    } catch (error) {
      return {
        tmdbTestMessage:
          error instanceof Error
            ? error.message
            : "TMDb connection test failed.",
        tmdbTestOk: false,
      };
    }
  },
};
