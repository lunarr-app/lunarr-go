import { apiError, apiJson } from "$lib/server/api/json";
import type { GuestShareSeasonResponse } from "$lib/server/api/types";
import { getShareSeasonData } from "$lib/server/shares";
import { enforceGuestShareRateLimit } from "$lib/server/shares/rate-limit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const limited = enforceGuestShareRateLimit(event, "share:resolve");
  if (limited) return limited;

  const season = await getShareSeasonData(event.params.token, event.params.seasonId);
  if (!season) {
    return apiError("Share season not found or no longer available.", 404);
  }

  return apiJson<GuestShareSeasonResponse>({ season });
};
