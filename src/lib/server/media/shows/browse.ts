import type { ShowBrowseRailResponse, ShowBrowseRowsResponse } from "$lib/media/types";
import { sql } from "kysely";
import { tmdbImageUrl } from "$lib/media/images";
import { SHOW_PAGE_SIZE, normalizePage, type ShowSort, type ShowBrowseRail } from "../catalog";
import type { ShowBrowseRow } from "../types";
import { filteredShows, orderShowBrowseQuery, showBrowseSelect } from "./browse-query";

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
  const page = normalizePage(pageInput);
  const cleanPageSize = Math.max(1, Math.min(Math.floor(pageSize), 200));
  const filtered = await filteredShows(userId, search);
  const mapShow = (show: ShowBrowseRow) => publicShowSummary(show);

  const fetchRail = async (
    rail: Exclude<ShowBrowseRail, "continueWatching" | "nextUp">,
  ): Promise<ShowBrowseRailResponse> => {
    if (rail === "recent") {
      const recentRows = await orderShowBrowseQuery(showBrowseSelect(filtered), "recent").limit(24).execute();
      return { recent: recentRows.map(mapShow) };
    }

    if (rail === "latest") {
      const latestRows = await orderShowBrowseQuery(showBrowseSelect(filtered), "latest").limit(24).execute();
      return { latest: latestRows.map(mapShow) };
    }

    if (rail === "popular") {
      const popularRows = await orderShowBrowseQuery(showBrowseSelect(filtered), "popular").limit(24).execute();
      return { popular: popularRows.map(mapShow) };
    }

    const totalRow = await filtered.select(sql<number>`count(distinct show.id)`.as("total")).executeTakeFirst();
    const total = Number(totalRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / cleanPageSize));
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * cleanPageSize;
    const allRows = await orderShowBrowseQuery(showBrowseSelect(filtered), sort)
      .limit(cleanPageSize)
      .offset(offset)
      .execute();
    return {
      all: allRows.map(mapShow),
      allPage: {
        page: currentPage,
        pageSize: cleanPageSize,
        total,
        totalPages,
        hasPrevious: currentPage > 1,
        hasNext: currentPage < totalPages,
      },
    };
  };

  if (rails && rails.length > 0) {
    const parts = await Promise.all(rails.map((rail) => fetchRail(rail)));
    return Object.assign({}, ...parts);
  }

  const totalRow = await filtered.select(sql<number>`count(distinct show.id)`.as("total")).executeTakeFirst();
  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / cleanPageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * cleanPageSize;

  const [allRows, recentRows, latestRows, popularRows] = await Promise.all([
    orderShowBrowseQuery(showBrowseSelect(filtered), sort).limit(cleanPageSize).offset(offset).execute(),
    orderShowBrowseQuery(showBrowseSelect(filtered), "recent").limit(24).execute(),
    orderShowBrowseQuery(showBrowseSelect(filtered), "latest").limit(24).execute(),
    orderShowBrowseQuery(showBrowseSelect(filtered), "popular").limit(24).execute(),
  ]);

  return {
    all: allRows.map(mapShow),
    allPage: {
      page: currentPage,
      pageSize: cleanPageSize,
      total,
      totalPages,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages,
    },
    recent: recentRows.map(mapShow),
    latest: latestRows.map(mapShow),
    popular: popularRows.map(mapShow),
  } satisfies ShowBrowseRowsResponse;
}
