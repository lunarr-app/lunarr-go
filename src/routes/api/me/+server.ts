import { apiErrorFrom, requireJsonUser } from "#lib/server/api.js";
import { apiJson } from "#lib/server/api/json.js";
import type { MeResponse } from "#lib/server/api/types.js";
import { getUserProfilePreferences } from "#lib/server/profile/preferences.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const preferences = await getUserProfilePreferences(user.id);

    return apiJson<MeResponse>({
      user,
      ...preferences,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not load profile.", 500);
  }
};
