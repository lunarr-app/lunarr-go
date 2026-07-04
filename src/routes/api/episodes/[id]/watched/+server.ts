import { apiError, apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse } from "$lib/server/api/types";
import { booleanFromJson, readJsonBody, requireJsonUser } from "$lib/server/api";
import { markWatched } from "$lib/server/playback";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const fileId =
      typeof body === "object" && body ? String((body as { mediaFileId?: unknown }).mediaFileId ?? "") : "";
    if (!fileId) return apiError("File is required.");

    await markWatched({
      userId: user.id,
      mediaItemId: params.id,
      mediaFileId: fileId,
      completed: booleanFromJson(
        typeof body === "object" && body ? (body as { completed?: unknown }).completed : undefined,
      ),
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not update watched status.");
  }

  return apiJson<ApiOkResponse>({ ok: true });
};
