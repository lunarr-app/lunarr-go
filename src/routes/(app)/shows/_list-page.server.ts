import { normalizePage, showListRows, type ShowSort } from "$lib/server/media";

type ShowListLoadEvent = {
  locals: App.Locals;
  url: URL;
};

export function createPresetShowListLoad(sort: ShowSort) {
  return async ({ locals, url }: ShowListLoadEvent) => {
    const page = normalizePage(url.searchParams.get("page"));
    const rows = await showListRows(locals.user!.id, "", sort, page);

    return {
      shows: rows.shows,
      pageInfo: rows.page,
    };
  };
}
