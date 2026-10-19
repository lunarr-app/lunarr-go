import { apiErrorFrom, apiJson } from "#lib/server/api/json.js";
import type { SettingsActionResponse } from "#lib/server/api/types.js";
import { parseBody, requireJsonAdmin } from "#lib/server/api.js";
import { runSettingsAction } from "#lib/server/settings-commands.js";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const settingsActionSchema = z.object({
  action: z.enum([
    "scanAll",
    "refreshMovieMetadata",
    "refreshTvMetadata",
    "repairMediaProbes",
    "testTmdb",
    "cleanupPlaybackArtifacts",
  ]),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const { action } = await parseBody(request, settingsActionSchema);
    const result = await runSettingsAction(action);
    return apiJson<SettingsActionResponse>(result, {
      status: action === "testTmdb" || action === "cleanupPlaybackArtifacts" ? 200 : 202,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not run settings action.");
  }
};
