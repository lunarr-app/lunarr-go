import { getPersonDetail } from "$lib/server/media";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  const detail = await getPersonDetail(params.provider, params.id, locals.user!.id);
  if (!detail) throw error(404, "Person not found");
  return detail;
};
