import { normalizePage, type ShowSort } from "$lib/server/media/catalog";
import { showBrowseRows } from "$lib/server/media/shows/browse";

type ShowListLoadEvent = {
  locals: App.Locals;
  url: URL;
};

export function createPresetShowListLoad(sort: ShowSort) {
  return async ({ locals, url }: ShowListLoadEvent) => {
    const page = normalizePage(url.searchParams.get("page"));
    const rows = await showBrowseRows(locals.user!.id, "", sort, page);

    return {
      shows: rows.all,
      pageInfo: rows.allPage,
    };
  };
}
