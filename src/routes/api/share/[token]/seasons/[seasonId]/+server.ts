import { getShareSeasonData } from "$lib/server/shares";
import { enforceGuestShareRateLimit } from "$lib/server/shares/rate-limit";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const limited = enforceGuestShareRateLimit(event, "share:resolve");
  if (limited) return limited;

  const season = await getShareSeasonData(event.params.token, event.params.seasonId);
  if (!season) {
    return json({ error: "Share season not found or no longer available." }, { status: 404 });
  }

  return json({ season });
};
