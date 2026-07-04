import { getPersonDetail } from "$lib/server/media/people";
import { normalizePage } from "$lib/server/media/catalog";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const detail = await getPersonDetail(params.provider, params.id, locals.user!.id, {
    moviePage: normalizePage(url.searchParams.get("moviesPage")),
    showPage: normalizePage(url.searchParams.get("showsPage")),
  });
  if (!detail) throw error(404, "Person not found");
  return detail;
};
