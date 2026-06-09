import { externalMovieSubtitleResponse } from "$lib/server/media/subtitles";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  return externalMovieSubtitleResponse(params.id, locals.user.id);
};

export const HEAD: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(null, { status: 401 });
  }

  return externalMovieSubtitleResponse(params.id, locals.user.id, false);
};
