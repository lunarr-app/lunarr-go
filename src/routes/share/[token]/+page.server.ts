import { getSharePageData } from "$lib/server/shares";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
  const share = await getSharePageData(params.token);
  if (!share) throw error(404, "This share link is unavailable.");
  return { share };
};
