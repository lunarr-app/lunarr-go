import {
  getTranscodePolicy,
  normalizePlaybackPreference,
  setUserPlaybackPreference,
} from "$lib/server/transcoding/policy";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw error(401, "Unauthorized");

  return {
    user: locals.user,
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

    throw redirect(303, "/profile");
  },
};
