import { apiErrorFrom, requireJsonAdmin } from "#lib/server/api.js";
import { apiJson } from "#lib/server/api/json.js";
import type { SettingsResponse } from "#lib/server/api/types.js";
import { getAdminSettingsResponse } from "#lib/server/settings-commands.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    return apiJson<SettingsResponse>(await getAdminSettingsResponse(user.id));
  } catch (error) {
    return apiErrorFrom(error, "Could not load settings.", 500);
  }
};
