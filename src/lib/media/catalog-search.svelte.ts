import { page } from "$app/state";
import { CATALOG_SEARCH_DEBOUNCE_MS, gotoCatalogSearch, type CatalogSearchInput } from "$lib/media/search";

export function createDebouncedCatalogSearch(
  getServerQuery: () => string,
  extraParams: () => Omit<CatalogSearchInput, "query"> = () => ({}),
  defaultSort = "title",
) {
  let queryInput = $state("");
  let searchInput = $state<HTMLInputElement | null>(null);
  let searchSubmitTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (searchInput && document.activeElement === searchInput) return;
    queryInput = getServerQuery();
  });

  $effect(() => {
    return () => {
      if (searchSubmitTimer) {
        clearTimeout(searchSubmitTimer);
        searchSubmitTimer = undefined;
      }
    };
  });

  function commitSearch(overrides: Omit<CatalogSearchInput, "query"> = {}) {
    if (searchSubmitTimer) {
      clearTimeout(searchSubmitTimer);
      searchSubmitTimer = undefined;
    }
    gotoCatalogSearch(
      page.url.pathname,
      page.url.searchParams,
      {
        query: queryInput,
        ...extraParams(),
        ...overrides,
      },
      defaultSort,
    );
  }

  function submitSearchSoon() {
    if (searchSubmitTimer) clearTimeout(searchSubmitTimer);
    searchSubmitTimer = setTimeout(() => {
      searchSubmitTimer = undefined;
      commitSearch();
    }, CATALOG_SEARCH_DEBOUNCE_MS);
  }

  return {
    get queryInput() {
      return queryInput;
    },
    set queryInput(value: string) {
      queryInput = value;
    },
    get searchInput() {
      return searchInput;
    },
    set searchInput(value: HTMLInputElement | null) {
      searchInput = value;
    },
    commitSearch,
    submitSearchSoon,
  };
}
