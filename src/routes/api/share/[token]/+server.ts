import { apiError, apiJson } from "#lib/server/api/json.js";
import type { GuestSharePageResponse } from "#lib/server/api/types.js";
import { getSharePageData } from "#lib/server/shares/index.js";
import { enforceGuestShareRateLimit } from "#lib/server/shares/rate-limit.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const limited = enforceGuestShareRateLimit(event, "share:resolve");
  if (limited) return limited;

  const data = await getSharePageData(event.params.token);
  if (!data) {
    return apiError("Share not found or no longer available.", 404);
  }
  return apiJson<GuestSharePageResponse>({ share: data });
};
