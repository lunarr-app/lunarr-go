import { tvRows } from "$lib/server/media/shows/episodes";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const rows = await tvRows(locals.user!.id, "", "title");
  return { rows };
};
