import { isAdmin } from "$lib/server/auth/users";
import { getMovieDetail } from "$lib/server/media/movies";
import { metadataRefreshFailure, metadataRefreshPrerequisites } from "$lib/server/metadata/detail-refresh";
import { refreshMovieMetadataResult } from "$lib/server/metadata/movies";
import { tmdbCredentialsConfigured } from "$lib/server/metadata/tmdb";
import { markWatched } from "$lib/server/playback";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  const detail = await getMovieDetail(params.id, locals.user!.id);
  if (!detail) throw error(404, "Movie not found");
  return {
    ...detail,
    canManageMetadata: isAdmin(locals.user),
    canManageShares: isAdmin(locals.user),
    tmdbConfigured: await tmdbCredentialsConfigured(),
  };
};

export const actions: Actions = {
  watched: async ({ params, request, locals }) => {
    const form = await request.formData();
    const fileId = String(form.get("fileId") ?? "");
    const completed = String(form.get("completed") ?? "") === "true";
    if (!fileId) return fail(400, { error: "File is required." });

    try {
      await markWatched({
        userId: locals.user!.id,
        mediaItemId: params.id,
        mediaFileId: fileId,
        completed,
      });
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : "Could not update watched status.",
      });
    }

    throw redirect(303, `/movies/${params.id}`);
  },
  refreshMetadata: async ({ params, locals }) => {
    const prerequisiteFailure = await metadataRefreshPrerequisites(locals.user);
    if (prerequisiteFailure) return prerequisiteFailure;

    let redirectId = params.id;
    try {
      const result = await refreshMovieMetadataResult(params.id);
      if (result.status === "missing") return fail(404, { metadataError: "Movie not found." });
      if (result.status === "unmatched")
        return fail(400, {
          metadataError: "No TMDb match was found for this movie.",
        });
      redirectId = result.mediaItemId;
    } catch (error) {
      return metadataRefreshFailure(error);
    }

    throw redirect(303, `/movies/${redirectId}`);
  },
};
