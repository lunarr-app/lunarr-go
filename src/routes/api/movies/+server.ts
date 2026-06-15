import { movieRows, normalizeMovieSort, normalizeMovieStatusFilter, normalizePage } from "$lib/server/media";
import { requireJsonUser } from "$lib/server/api";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  return json(
    await movieRows(
      user.id,
      url.searchParams.get("search") ?? "",
      normalizeMovieStatusFilter(url.searchParams.get("status")),
      normalizeMovieSort(url.searchParams.get("sort")),
      normalizePage(url.searchParams.get("page")),
    ),
  );
};
