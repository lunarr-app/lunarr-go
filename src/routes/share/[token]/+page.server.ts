import { getSharePageData } from "$lib/server/shares";
import { enforceGuestShareRateLimit } from "$lib/server/shares/rate-limit";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const limited = enforceGuestShareRateLimit(event, "share:resolve");
  if (limited) {
    throw error(429, "Too many requests. Try again later.");
  }

  const share = await getSharePageData(event.params.token);
  if (!share) throw error(404, "This share link is unavailable.");
  return { share };
};
