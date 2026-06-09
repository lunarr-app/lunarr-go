import { mediaStreamHeadResponse, mediaStreamResponse } from "$lib/server/media/stream";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  return mediaStreamResponse(params.id, locals.user.id, request.headers.get("range"));
};

export const HEAD: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return new Response(null, { status: 401 });
  }

  return mediaStreamHeadResponse(params.id, locals.user.id, request.headers.get("range"));
};
