import { apiErrorFrom, parseBody, recordObjectSchema, requireJsonAdmin } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { LibrariesResponse, LibraryResponse } from "$lib/server/api/types";
import { createLibrary, listLibrariesWithScanStatus, listLibraryShareUsers } from "$lib/server/libraries";
import { parseCreateLibraryInput } from "$lib/server/libraries/input";
import { tmdbCredentialsConfigured } from "$lib/server/metadata/tmdb";
import { syncScheduledLibraryScans } from "$lib/server/scanner/scheduler";
import { syncLibraryWatchers } from "$lib/server/scanner/watchers";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  return apiJson<LibrariesResponse>({
    libraries: await listLibrariesWithScanStatus(),
    users: await listLibraryShareUsers(),
    tmdbConfigured: await tmdbCredentialsConfigured(),
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const input = await parseBody(request, recordObjectSchema);
    const library = await createLibrary(parseCreateLibraryInput(input));
    await syncLibraryWatchers();
    await syncScheduledLibraryScans();
    return apiJson<LibraryResponse>({ library }, { status: 201 });
  } catch (error) {
    return apiErrorFrom(error, "Could not add library.");
  }
};
