import { sql } from "kysely";
import type { CatalogPageInfo } from "$lib/media/types";

const MOVIE_STATUS_FILTERS = ["all", "watched", "unwatched"] as const;
const MOVIE_SORTS = ["title", "recent", "year_desc", "rating", "release_date"] as const;
export const MOVIE_PAGE_SIZE = 36;
export const SHOW_PAGE_SIZE = 36;
const SHOW_SORTS = ["title", "recent", "latest", "popular"] as const;

export type MovieStatusFilter = (typeof MOVIE_STATUS_FILTERS)[number];
export type MovieSort = (typeof MOVIE_SORTS)[number];
export type ShowSort = (typeof SHOW_SORTS)[number];

export function normalizeMovieStatusFilter(value: string | null | undefined): MovieStatusFilter {
  return MOVIE_STATUS_FILTERS.includes(value as MovieStatusFilter) ? (value as MovieStatusFilter) : "all";
}

export function normalizeMovieSort(value: string | null | undefined): MovieSort {
  return MOVIE_SORTS.includes(value as MovieSort) ? (value as MovieSort) : "title";
}

export function normalizeShowSort(value: string | null | undefined): ShowSort {
  return SHOW_SORTS.includes(value as ShowSort) ? (value as ShowSort) : "title";
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
