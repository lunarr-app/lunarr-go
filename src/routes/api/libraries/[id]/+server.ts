import { apiError, apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse, LibraryDetailResponse } from "$lib/server/api/types";
import { readJsonBody, requireJsonAdmin } from "$lib/server/api";
import { deleteLibrary, getLibrary, updateLibrary } from "$lib/server/libraries";
import { parseUpdateLibraryInput } from "$lib/server/libraries/input";
import { syncScheduledLibraryScans } from "$lib/server/scanner/scheduler";
import { syncLibraryWatchers } from "$lib/server/scanner/watchers";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const library = await getLibrary(params.id);
  if (!library) return apiError("Library not found.", 404);

  return apiJson<LibraryDetailResponse>({ library });
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const library = await updateLibrary(
      params.id,
      parseUpdateLibraryInput(typeof body === "object" && body ? (body as Record<string, unknown>) : {}),
    );
    if (!library) return apiError("Library not found.", 404);
    await syncLibraryWatchers();
    await syncScheduledLibraryScans();
    return apiJson<LibraryDetailResponse>({ library });
  } catch (error) {
    return apiErrorFrom(error, "Could not update library.");
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    await deleteLibrary(params.id);
    await syncLibraryWatchers();
    await syncScheduledLibraryScans();
    return apiJson<ApiOkResponse>({ ok: true });
  } catch (error) {
    return apiErrorFrom(error, "Could not remove library.");
  }
};
