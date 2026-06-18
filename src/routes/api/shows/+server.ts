import { normalizePage, normalizeShowSort } from "$lib/server/media/catalog";
import { tvRows } from "$lib/server/media/shows";
import { requireJsonUser } from "$lib/server/api";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  return json(
    await tvRows(
      user.id,
      url.searchParams.get("search") ?? "",
      normalizeShowSort(url.searchParams.get("sort")),
      normalizePage(url.searchParams.get("page")),
    ),
  );
};
