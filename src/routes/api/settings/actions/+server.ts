import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { SettingsActionResponse } from "$lib/server/api/types";
import { readJsonBody, requireJsonAdmin } from "$lib/server/api";
import { runSettingsAction } from "$lib/server/settings-commands";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const action = typeof body === "object" && body ? String((body as { action?: unknown }).action ?? "") : "";
    const result = await runSettingsAction(action);
    return apiJson<SettingsActionResponse>(result, {
      status: action === "testTmdb" || action === "cleanupPlaybackArtifacts" ? 200 : 202,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not run settings action.");
  }
};
