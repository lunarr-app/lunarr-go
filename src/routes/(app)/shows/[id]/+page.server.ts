import { isAdmin } from "$lib/server/auth/users";
import { getShowCredits, getShowOverview, getShowResumeEpisode } from "$lib/server/media/shows/detail";
import { isInWatchlist, toggleWatchlist } from "$lib/server/media/watchlist";
import { metadataRefreshFailure, metadataRefreshPrerequisites } from "$lib/server/metadata/detail-refresh";
import { refreshTvShowMetadataResult } from "$lib/server/metadata/tv";
import { tmdbCredentialsConfigured } from "$lib/server/metadata/tmdb";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  const userId = locals.user!.id;
  const [overview, credits, nextEpisode, inWatchlist] = await Promise.all([
    getShowOverview(params.id, userId),
    getShowCredits(params.id, userId),
    getShowResumeEpisode(params.id, userId),
    isInWatchlist(userId, params.id),
  ]);
  if (!overview || !credits) throw error(404, "Show not found");

  return {
    ...overview,
    cast: credits.cast,
    nextEpisode,
    inWatchlist,
    canManageMetadata: isAdmin(locals.user),
    canManageShares: isAdmin(locals.user),
    tmdbConfigured: await tmdbCredentialsConfigured(),
  };
};

export const actions: Actions = {
  watchlist: async ({ params, locals }) => {
    try {
      await toggleWatchlist(locals.user!.id, params.id);
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : "Could not update watchlist.",
      });
    }

    throw redirect(303, `/shows/${params.id}`);
  },
  refreshMetadata: async ({ params, locals }) => {
    const prerequisiteFailure = await metadataRefreshPrerequisites(locals.user);
    if (prerequisiteFailure) return prerequisiteFailure;

    let redirectId = params.id;
    try {
      const result = await refreshTvShowMetadataResult(params.id);
      if (result.status === "missing") return fail(404, { metadataError: "Show not found." });
      if (result.status === "no_seasons")
        return fail(400, {
          metadataError: "This show has no seasons to refresh.",
        });
      if (result.status === "unmatched")
        return fail(400, {
          metadataError: "No TMDb match was found for this show.",
        });
      redirectId = result.mediaItemId;
    } catch (error) {
      return metadataRefreshFailure(error);
    }

    throw redirect(303, `/shows/${redirectId}`);
  },
};
