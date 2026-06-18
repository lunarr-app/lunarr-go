import { getShowDetail } from "$lib/server/media/shows";
import { markWatched } from "$lib/server/playback";
import { markSeasonWatched } from "$lib/server/playback/commands";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  const detail = await getShowDetail(params.id, locals.user!.id);
  if (!detail) throw error(404, "Show not found");

  const season = detail.seasons.find((season) => season.id === params.seasonId);
  if (!season) throw error(404, "Season not found");

  return {
    ...detail,
    season,
  };
};

export const actions: Actions = {
  watched: async ({ params, request, locals }) => {
    const form = await request.formData();
    const episodeId = String(form.get("episodeId") ?? "");
    const fileId = String(form.get("fileId") ?? "");
    const completed = String(form.get("completed") ?? "") === "true";
    if (!episodeId || !fileId) return fail(400, { error: "Episode file is required." });

    try {
      await markWatched({
        userId: locals.user!.id,
        mediaItemId: episodeId,
        mediaFileId: fileId,
        completed,
      });
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : "Could not update watched status.",
      });
    }

    throw redirect(303, `/shows/${params.id}/seasons/${params.seasonId}`);
  },
  seasonWatched: async ({ params, request, locals }) => {
    const form = await request.formData();
    const completed = String(form.get("completed") ?? "") === "true";

    try {
      await markSeasonWatched({
        userId: locals.user!.id,
        showId: params.id,
        seasonId: params.seasonId,
        completed,
      });
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : "Could not update season watched status.",
      });
    }

    throw redirect(303, `/shows/${params.id}/seasons/${params.seasonId}`);
  },
};
