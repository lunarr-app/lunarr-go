import { resolveShowSeason, showSeasonHref, showSeasonKey } from "$lib/media/seasons";
import { getShowDetail } from "$lib/server/media/shows";
import { markWatched } from "$lib/server/playback";
import { markSeasonWatched } from "$lib/server/playback/commands";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  const detail = await getShowDetail(params.id, locals.user!.id);
  if (!detail) throw error(404, "Show not found");

  const season = resolveShowSeason(detail.seasons, params.seasonId);
  if (!season) throw error(404, "Season not found");

  const canonicalSeasonKey = showSeasonKey(season);
  if (params.seasonId !== canonicalSeasonKey) {
    throw redirect(301, showSeasonHref(detail.show.id, season));
  }

  return {
    ...detail,
    season,
  };
};

export const actions: Actions = {
  watched: async ({ params, request, locals }) => {
    const detail = await getShowDetail(params.id, locals.user!.id);
    if (!detail) return fail(404, { error: "Show not found." });

    const season = resolveShowSeason(detail.seasons, params.seasonId);
    if (!season) return fail(404, { error: "Season not found." });

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

    throw redirect(303, showSeasonHref(detail.show.id, season));
  },
  seasonWatched: async ({ params, request, locals }) => {
    const detail = await getShowDetail(params.id, locals.user!.id);
    if (!detail) return fail(404, { error: "Show not found." });

    const season = resolveShowSeason(detail.seasons, params.seasonId);
    if (!season) return fail(404, { error: "Season not found." });

    const form = await request.formData();
    const completed = String(form.get("completed") ?? "") === "true";

    try {
      await markSeasonWatched({
        userId: locals.user!.id,
        showId: params.id,
        seasonId: season.id,
        completed,
      });
    } catch (error) {
      return fail(400, {
        error: error instanceof Error ? error.message : "Could not update season watched status.",
      });
    }

    throw redirect(303, showSeasonHref(detail.show.id, season));
  },
};
