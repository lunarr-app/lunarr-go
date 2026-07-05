import { sql } from "kysely";
import type { CatalogPageInfo } from "$lib/media/types";

const MOVIE_STATUS_FILTERS = ["all", "watched", "unwatched"] as const;
const MOVIE_SORTS = ["title", "recent", "year_desc", "rating", "release_date"] as const;
export const MOVIE_PAGE_SIZE = 36;
export const SHOW_PAGE_SIZE = 36;
const SHOW_SORTS = ["title", "recent", "latest", "popular"] as const;
export const MOVIE_BROWSE_RAILS = ["continueWatching", "all", "recent", "latest", "popular"] as const;
export const SHOW_BROWSE_RAILS = ["continueWatching", "nextUp", "all", "recent", "latest", "popular"] as const;

export type MovieStatusFilter = (typeof MOVIE_STATUS_FILTERS)[number];
export type MovieSort = (typeof MOVIE_SORTS)[number];
export type ShowSort = (typeof SHOW_SORTS)[number];
export type MovieBrowseRail = (typeof MOVIE_BROWSE_RAILS)[number];
export type ShowBrowseRail = (typeof SHOW_BROWSE_RAILS)[number];

export function normalizeMovieStatusFilter(value: string | null | undefined): MovieStatusFilter {
  return MOVIE_STATUS_FILTERS.includes(value as MovieStatusFilter) ? (value as MovieStatusFilter) : "all";
}

export function normalizeMovieSort(value: string | null | undefined): MovieSort {
  return MOVIE_SORTS.includes(value as MovieSort) ? (value as MovieSort) : "title";
}

export function normalizeShowSort(value: string | null | undefined): ShowSort {
  return SHOW_SORTS.includes(value as ShowSort) ? (value as ShowSort) : "title";
}

export function parseBrowseRails<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T[] | null | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const rails: T[] = [];
  for (const token of trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)) {
    if (!allowed.includes(token as T)) return null;
    const rail = token as T;
    if (!rails.includes(rail)) rails.push(rail);
  }
  return rails;
}

export function parseMovieBrowseRails(value: string | null): MovieBrowseRail[] | null | undefined {
  return parseBrowseRails(value, MOVIE_BROWSE_RAILS);
}

export function parseShowBrowseRails(value: string | null): ShowBrowseRail[] | null | undefined {
  return parseBrowseRails(value, SHOW_BROWSE_RAILS);
}

export function normalizePage(value: string | number | null | undefined) {
  const page = Number(value ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function catalogPageSize(pageSizeInput: number) {
  return Math.max(1, Math.min(Math.floor(pageSizeInput), 200));
}

export function catalogPageInfo(pageInput: number, pageSizeInput: number, total: number): CatalogPageInfo {
  const pageSize = catalogPageSize(pageSizeInput);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(normalizePage(pageInput), totalPages);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

export function emptyCatalogPage(pageInput: number, pageSizeInput: number): CatalogPageInfo {
  return {
    page: normalizePage(pageInput),
    pageSize: catalogPageSize(pageSizeInput),
    total: 0,
    totalPages: 1,
    hasPrevious: false,
    hasNext: false,
  };
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function searchLikePattern(searchPattern: string) {
  return `%${escapeLikePattern(searchPattern)}%`;
}

export function browseMatchesSearchSql(
  searchPattern: string,
  rootIdColumn: string,
  likeExpressions: readonly string[],
) {
  const pattern = searchLikePattern(searchPattern);
  const likes = likeExpressions.map((expression) => sql`${sql.raw(expression)} like ${pattern} escape '\\'`);

  return sql<boolean>`(
    ${sql.join(likes, sql` or `)}
    or exists (
      select 1
      from media_item_keyword
      where media_item_keyword.media_item_id = ${sql.ref(rootIdColumn)}
        and media_item_keyword.name like ${pattern} escape '\\'
    )
    or exists (
      select 1
      from media_item_genre
      where media_item_genre.media_item_id = ${sql.ref(rootIdColumn)}
        and media_item_genre.name like ${pattern} escape '\\'
    )
  )`;
}

export function accessibleLibrarySql(userId: string, libraryIdRef = "media_file.library_id") {
  return sql<boolean>`(
    exists (
      select 1
      from user
      where user.id = ${userId}
        and user.role = 'admin'
    )
    or exists (
      select 1
      from library
      where library.id = ${sql.ref(libraryIdRef)}
        and library.access_mode = 'all'
    )
    or exists (
      select 1
      from library_user
      where library_user.library_id = ${sql.ref(libraryIdRef)}
        and library_user.user_id = ${userId}
    )
  )`;
}
