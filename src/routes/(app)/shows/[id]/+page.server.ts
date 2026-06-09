import { getShowDetail } from "$lib/server/media";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  const detail = await getShowDetail(params.id, locals.user!.id);
  if (!detail) throw error(404, "Show not found");
  return detail;
};
