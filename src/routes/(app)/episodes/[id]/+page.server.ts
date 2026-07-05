import { getEpisodeDetail } from "$lib/server/media/shows/detail";
import { markWatched } from "$lib/server/playback";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  const detail = await getEpisodeDetail(params.id, locals.user!.id);
  if (!detail) throw error(404, "Episode not found");
  return detail;
};

export const actions: Actions = {
  watched: async ({ params, request, locals }) => {
    const form = await request.formData();
    const fileId = String(form.get("fileId") ?? "");
    const completed = String(form.get("completed") ?? "") === "true";
    if (!fileId) return fail(400, { error: "Episode file is required." });

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

    throw redirect(303, `/episodes/${params.id}`);
  },
};
