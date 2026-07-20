import { goto } from "$app/navigation";

export const CATALOG_SEARCH_DEBOUNCE_MS = 350;
export const MOVIE_SEARCH_PLACEHOLDER = "Search title, keyword, genre, filename";
export const SHOW_SEARCH_PLACEHOLDER = "Search title, episode, keyword, genre, filename";

export type CatalogSearchInput = {
  query?: string;
  status?: string;
  sort?: string;
};

export function catalogSearchHref(
  pathname: string,
  searchParams: URLSearchParams,
  input: CatalogSearchInput,
  defaultSort = "title",
) {
  const params = new URLSearchParams(searchParams);
  if (input.query !== undefined) {
    const trimmed = input.query.trim();
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
  }
  if (input.status !== undefined) {
    if (input.status === "all") params.delete("status");
    else params.set("status", input.status);
  }
  if (input.sort !== undefined) {
    if (!input.sort || input.sort === defaultSort) params.delete("sort");
    else params.set("sort", input.sort);
  }
  params.delete("page");
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function gotoCatalogSearch(
  pathname: string,
  searchParams: URLSearchParams,
  input: CatalogSearchInput,
  defaultSort = "title",
) {
  const href = catalogSearchHref(pathname, searchParams, input, defaultSort);
  const current = `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`;
  if (href === current) return;
  void goto(href, { keepFocus: true, noScroll: true, invalidateAll: true });
}
