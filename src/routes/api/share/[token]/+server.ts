import { getSharePageData } from "$lib/server/shares";
import { enforceGuestShareRateLimit } from "$lib/server/shares/rate-limit";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const limited = enforceGuestShareRateLimit(event, "share:resolve");
  if (limited) return limited;

  const data = await getSharePageData(event.params.token);
  if (!data) {
    return json({ error: "Share not found or no longer available." }, { status: 404 });
  }
  return json({ share: data });
};
