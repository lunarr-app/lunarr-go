import { apiError, apiJson } from "$lib/server/api/json";
import type { GuestSharePageResponse } from "$lib/server/api/types";
import { getSharePageData } from "$lib/server/shares";
import { enforceGuestShareRateLimit } from "$lib/server/shares/rate-limit";
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
