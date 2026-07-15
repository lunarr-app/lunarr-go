import { movieRows } from "$lib/server/media/movies/browse";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const rows = await movieRows(locals.user!.id, "", "all", "title");
  return { rows };
};
