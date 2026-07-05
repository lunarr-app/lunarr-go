import type { CatalogPageInfo, ShowBrowseRailResponse, ShowBrowseRowsResponse } from "$lib/media/types";
import { sql } from "kysely";
import { tmdbImageUrl } from "$lib/media/images";
import { getDb } from "../../db";
import { SHOW_PAGE_SIZE, catalogPageInfo, normalizePage, type ShowSort, type ShowBrowseRail } from "../catalog";
import type { ShowBrowseRow } from "../types";
import { filteredShows, orderShowBrowseQuery, showBrowseSelect } from "./browse-query";

async function paginatedGroupedRail<T extends ShowBrowseRow>(
  orderedQuery: { limit(n: number): { offset(n: number): { execute(): Promise<T[]> } } },
  countQuery: () => Promise<number>,
  page: number,
  limit: number,
): Promise<{ items: T[]; page: CatalogPageInfo }> {
  const total = await countQuery();
  const pageInfo = catalogPageInfo(page, limit, total);
  if (total === 0) return { items: [], page: pageInfo };
  const offset = (pageInfo.page - 1) * pageInfo.pageSize;
  const items = await orderedQuery.limit(pageInfo.pageSize).offset(offset).execute();
  return { items, page: pageInfo };
}

export async function showBrowseRowsForIds(userId: string, ids: string[]) {
  if (ids.length === 0) return [] as ShowBrowseRow[];
  const filtered = await filteredShows(userId);
  const rows = await showBrowseSelect(filtered).where("show.id", "in", ids).execute();
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}

export function publicShowSummary(show: ShowBrowseRow) {
  return {
    id: show.id,
    title: show.title,
    year: show.year,
    posterUrl: tmdbImageUrl(show.poster_path),
    backdropUrl: tmdbImageUrl(show.backdrop_path, "w780"),
    releaseDate: show.release_date,
    status: show.status,
    popularity: show.popularity,
    voteAverage: show.vote_average,
    episodeCount: Number(show.episode_count ?? 0),
    seasonCount: Number(show.season_count ?? 0),
    latestFileCreatedAt: show.latest_file_created_at,
    latestEpisodeReleaseDate: show.latest_episode_release_date,
  };
}

export async function showRows(userId: string, search = "", sort: ShowSort = "title") {
  const filtered = await filteredShows(userId, search);
  return (await orderShowBrowseQuery(showBrowseSelect(filtered), sort).execute()).map(publicShowSummary);
}

export async function showBrowseRows(
  userId: string,
  search?: string,
  sort?: ShowSort,
  pageInput?: number,
  pageSize?: number,
  rails?: null,
): Promise<ShowBrowseRowsResponse>;
export async function showBrowseRows(
  userId: string,
  search: string,
  sort: ShowSort,
  pageInput: number,
  pageSize: number,
  rails: readonly Exclude<ShowBrowseRail, "continueWatching" | "nextUp">[],
): Promise<ShowBrowseRailResponse>;
export async function showBrowseRows(
  userId: string,
  search = "",
  sort: ShowSort = "title",
  pageInput = 1,
  pageSize = SHOW_PAGE_SIZE,
  rails: readonly Exclude<ShowBrowseRail, "continueWatching" | "nextUp">[] | null = null,
): Promise<ShowBrowseRowsResponse | ShowBrowseRailResponse> {
  const db = await getDb();
  const page = normalizePage(pageInput);
  const limit = Math.max(1, Math.min(Math.floor(pageSize), 200));
  const filtered = await filteredShows(userId, search);
  const mapShow = (show: ShowBrowseRow) => publicShowSummary(show);

  const countGroupedRail = async (orderedQuery: ReturnType<typeof showBrowseSelect>) => {
    const row = await db
      .selectFrom(orderedQuery.as("rail_rows"))
      .select(sql<number>`count(*)`.as("total"))
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  };

  const fetchRecentRail = async () => {
    const ordered = orderShowBrowseQuery(showBrowseSelect(filtered), "recent");
    return paginatedGroupedRail(ordered, () => countGroupedRail(ordered), page, limit);
  };

  const fetchLatestRail = async () => {
    const ordered = orderShowBrowseQuery(showBrowseSelect(filtered), "latest");
    return paginatedGroupedRail(ordered, () => countGroupedRail(ordered), page, limit);
  };

  const fetchPopularRail = async () => {
    const ordered = orderShowBrowseQuery(showBrowseSelect(filtered), "popular");
    return paginatedGroupedRail(ordered, () => countGroupedRail(ordered), page, limit);
  };

  const fetchAllRail = async () => {
    const totalRow = await filtered.select(sql<number>`count(distinct show.id)`.as("total")).executeTakeFirst();
    const total = Number(totalRow?.total ?? 0);
    const pageInfo = catalogPageInfo(page, limit, total);
    const offset = (pageInfo.page - 1) * pageInfo.pageSize;
    const allRows =
      total === 0
        ? []
        : await orderShowBrowseQuery(showBrowseSelect(filtered), sort)
            .limit(pageInfo.pageSize)
            .offset(offset)
            .execute();
    return { items: allRows, page: pageInfo };
  };

  const fetchRail = async (
    rail: Exclude<ShowBrowseRail, "continueWatching" | "nextUp">,
  ): Promise<ShowBrowseRailResponse> => {
    if (rail === "recent") {
      const { items, page: railPage } = await fetchRecentRail();
      return { recent: items.map(mapShow), recentPage: railPage };
    }

    if (rail === "latest") {
      const { items, page: railPage } = await fetchLatestRail();
      return { latest: items.map(mapShow), latestPage: railPage };
    }

    if (rail === "popular") {
      const { items, page: railPage } = await fetchPopularRail();
      return { popular: items.map(mapShow), popularPage: railPage };
    }

    const { items, page: railPage } = await fetchAllRail();
    return { all: items.map(mapShow), allPage: railPage };
  };

  if (rails && rails.length > 0) {
    const parts = await Promise.all(rails.map((rail) => fetchRail(rail)));
    return Object.assign({}, ...parts);
  }

  const [allRail, recentRail, latestRail, popularRail] = await Promise.all([
    fetchAllRail(),
    fetchRecentRail(),
    fetchLatestRail(),
    fetchPopularRail(),
  ]);

  return {
    all: allRail.items.map(mapShow),
    allPage: allRail.page,
    recent: recentRail.items.map(mapShow),
    recentPage: recentRail.page,
    latest: latestRail.items.map(mapShow),
    latestPage: latestRail.page,
    popular: popularRail.items.map(mapShow),
    popularPage: popularRail.page,
  } satisfies ShowBrowseRowsResponse;
}
