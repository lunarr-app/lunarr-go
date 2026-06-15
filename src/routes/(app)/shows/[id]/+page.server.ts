import { isAdmin } from "$lib/server/auth/users";
import { getShowDetail } from "$lib/server/media";
import { refreshTvShowMetadataResult } from "$lib/server/metadata/tv";
import { tmdbCredentialsConfigured } from "$lib/server/metadata/tmdb";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  const detail = await getShowDetail(params.id, locals.user!.id);
  if (!detail) throw error(404, "Show not found");
  return {
    ...detail,
    canManageMetadata: isAdmin(locals.user),
    tmdbConfigured: await tmdbCredentialsConfigured(),
  };
};

export const actions: Actions = {
  refreshMetadata: async ({ params, locals }) => {
    if (!isAdmin(locals.user)) return fail(403, { metadataError: "Only admins can refresh metadata." });
    if (!(await tmdbCredentialsConfigured()))
      return fail(400, {
        metadataError: "TMDb credentials are not configured.",
      });

    let redirectId = params.id;
    try {
      const result = await refreshTvShowMetadataResult(params.id);
      if (result.status === "missing") return fail(404, { metadataError: "Show not found." });
      if (result.status === "unmatched")
        return fail(400, {
          metadataError: "No TMDb match was found for this show.",
        });
      redirectId = result.mediaItemId;
    } catch (error) {
      return fail(400, {
        metadataError: error instanceof Error ? error.message : "Could not refresh metadata.",
      });
    }

    throw redirect(303, `/shows/${redirectId}`);
  },
};
