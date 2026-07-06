import { requireJsonUser } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { MeResponse } from "$lib/server/api/types";
import { getUserProfilePreferences } from "$lib/server/profile/preferences";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const preferences = await getUserProfilePreferences(user.id);

  return apiJson<MeResponse>({
    user,
    ...preferences,
  });
};
