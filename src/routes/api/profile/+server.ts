import { readJsonBody, requireJsonUser } from "$lib/server/api";
import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ProfilePreferencesResponse, ProfilePreferencesUpdate } from "$lib/server/api/types";
import {
  getUserProfilePreferences,
  hasProfilePreferenceUpdate,
  updateUserProfilePreferences,
} from "$lib/server/profile/preferences";
import type { RequestHandler } from "./$types";

export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const values =
      typeof body === "object" && body ? (body as ProfilePreferencesUpdate) : ({} as ProfilePreferencesUpdate);

    if (!hasProfilePreferenceUpdate(values)) {
      return apiErrorFrom(new Error("At least one preference field is required."), "Could not update profile.");
    }

    await updateUserProfilePreferences(user.id, values);
    return apiJson<ProfilePreferencesResponse>(await getUserProfilePreferences(user.id));
  } catch (error) {
    return apiErrorFrom(error, "Could not update profile.");
  }
};
