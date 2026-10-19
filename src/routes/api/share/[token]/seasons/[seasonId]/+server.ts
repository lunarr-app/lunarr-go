import { apiError, apiJson } from "#lib/server/api/json.js";
import type { GuestShareSeasonResponse } from "#lib/server/api/types.js";
import { getShareSeasonData } from "#lib/server/shares/index.js";
import { enforceGuestShareRateLimit } from "#lib/server/shares/rate-limit.js";
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
