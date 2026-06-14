import { booleanFromJson, jsonError, readJsonBody, requireJsonUser } from "$lib/server/api";
import { markSeasonWatched } from "$lib/server/playback/commands";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const completed = booleanFromJson(
      typeof body === "object" && body ? (body as { completed?: unknown }).completed : undefined,
    );
    await markSeasonWatched({
      userId: user.id,
      showId: params.id,
      seasonId: params.seasonId,
      completed,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Show not found." || error.message === "Season not found.")) {
      return json({ error: error.message }, { status: 404 });
    }
    return jsonError(error, "Could not update season watched status.");
  }

  return json({ ok: true });
};
