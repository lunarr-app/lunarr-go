import { showSeasonHref, showSeasonKey } from "$lib/media/seasons";
import { getShowSeasonDetail } from "$lib/server/media/shows/detail";
import { markWatched } from "$lib/server/playback";
import { markSeasonWatched } from "$lib/server/playback/commands";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  const detail = await getShowSeasonDetail(params.id, params.seasonId, locals.user!.id);
  if (!detail) throw error(404, "Show or season not found");

  const canonicalSeasonKey = showSeasonKey(detail.season);
  if (params.seasonId !== canonicalSeasonKey) {
    throw redirect(301, showSeasonHref(detail.show.id, detail.season));
  }

  return detail;
};

export const actions: Actions = {
  watched: async ({ params, request, locals }) => {
    const detail = await getShowSeasonDetail(params.id, params.seasonId, locals.user!.id);
    if (!detail) return fail(404, { error: "Show or season not found." });

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

    throw redirect(303, showSeasonHref(detail.show.id, detail.season));
  },
  seasonWatched: async ({ params, request, locals }) => {
    const detail = await getShowSeasonDetail(params.id, params.seasonId, locals.user!.id);
    if (!detail) return fail(404, { error: "Show or season not found." });

    const form = await request.formData();
    const completed = String(form.get("completed") ?? "") === "true";

    try {
      await markSeasonWatched({
        userId: locals.user!.id,
        showId: params.id,
        seasonId: detail.season.id,
        completed,
      });
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : "Could not update season watched status.",
      });
    }

    throw redirect(303, showSeasonHref(detail.show.id, detail.season));
  },
};
