import { requireJsonAdmin } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { SettingsResponse } from "$lib/server/api/types";
import { getAdminSettingsResponse } from "$lib/server/settings-commands";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  return apiJson<SettingsResponse>(await getAdminSettingsResponse(user.id));
};
