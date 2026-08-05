import type { FixMatchCandidate } from "$lib/media/types";
import { getDb } from "../db";
import { nowIso } from "../time";
import { applyMatchedMovieMetadata, rematchMovieItemFiles, type RefreshMetadataOptions } from "./movies";
import { applyMatchedTvSeasonMetadata, rematchTvShowSeasons, type RefreshTvMetadataOptions } from "./tv";
import {
  fetchTmdbShowMetadata,
  matchMovieMetadataById,
  matchTvSeasonMetadataById,
  type MatchedTvSeasonLookup,
  type TmdbCredentials,
  type TmdbFetch,
} from "./tmdb";
import { z } from "zod";

export const matchBodySchema = z.object({
  tmdbId: z.number().int().positive(),
});

export const MAX_MATCH_QUERY_LENGTH = 500;

export type MatchQueryParse = { ok: true; query: string } | { ok: false; error: string };

export function parseMatchQuery(url: URL): MatchQueryParse {
  const query = url.searchParams.get("query")?.trim() ?? "";
  if (!query) return { ok: false, error: "Query is required." };
  if (query.length > MAX_MATCH_QUERY_LENGTH) return { ok: false, error: "Query is too long." };
  return { ok: true, query };
}

export type FixMatchOptions = {
  credentials?: TmdbCredentials;
  fetch?: TmdbFetch;
};

export async function fixMatchTargetExists(kind: "movie" | "show", mediaItemId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db
    .selectFrom("media_item")
    .select("id")
    .where("id", "=", mediaItemId)
    .where("kind", "=", kind)
    .executeTakeFirst();
  return Boolean(row);
}

export type FixMovieMatchResult =
  | { status: "matched"; mediaItemId: string }
  | { status: "not_found"; mediaItemId: string }
  | { status: "missing"; mediaItemId: null };

export type FixShowMatchResult =
  | { status: "matched"; mediaItemId: string; matchedSeasons: number; addedEpisodes: number }
  | { status: "no_seasons"; mediaItemId: string }
  | { status: "not_found"; mediaItemId: string }
  | { status: "missing_seasons"; mediaItemId: string; missingSeasons: number[] }
  | { status: "missing"; mediaItemId: null };

function toMatchCandidate(metadata: {
  providerId: string;
  title: string;
  year: number | null;
  overview: string | null;
  posterPath: string | null;
}): FixMatchCandidate {
  return {
    providerId: metadata.providerId,
    title: metadata.title,
    year: metadata.year,
    overview: metadata.overview,
    posterPath: metadata.posterPath,
  };
}

export async function resolveMovieMatchCandidate(
  tmdbId: number,
  options: FixMatchOptions = {},
): Promise<FixMatchCandidate | null> {
  const metadata = await matchMovieMetadataById(tmdbId, options);
  return metadata ? toMatchCandidate(metadata) : null;
}

export async function resolveShowMatchCandidate(
  tmdbId: number,
  options: FixMatchOptions = {},
): Promise<FixMatchCandidate | null> {
  const metadata = await fetchTmdbShowMetadata(tmdbId, options);
  return metadata ? toMatchCandidate(metadata) : null;
}

export async function fixMovieMatch(
  mediaItemId: string,
  tmdbId: number,
  options: FixMatchOptions = {},
): Promise<FixMovieMatchResult> {
  const db = await getDb();
  const movie = await db
    .selectFrom("media_item")
    .select("id")
    .where("id", "=", mediaItemId)
    .where("kind", "=", "movie")
    .executeTakeFirst();
  if (!movie) return { status: "missing", mediaItemId: null };

  const metadata = await matchMovieMetadataById(tmdbId, options);
  if (!metadata) return { status: "not_found", mediaItemId };

  const finalMediaItemId = await applyMatchedMovieMetadata(mediaItemId, metadata, { manualMatch: true });
  return { status: "matched", mediaItemId: finalMediaItemId };
}

export async function fixShowMatch(
  showId: string,
  tmdbId: number,
  options: FixMatchOptions = {},
): Promise<FixShowMatchResult> {
  const db = await getDb();
  const show = await db
    .selectFrom("media_item")
    .select("id")
    .where("id", "=", showId)
    .where("kind", "=", "show")
    .executeTakeFirst();
  if (!show) return { status: "missing", mediaItemId: null };

  const seasons = await db
    .selectFrom("media_item")
    .select(["id", "season_number"])
    .where("parent_id", "=", showId)
    .where("kind", "=", "season")
    .where("season_number", "is not", null)
    .orderBy("season_number", "asc")
    .execute();
  if (seasons.length === 0) return { status: "no_seasons", mediaItemId: showId };

  const showMetadata = await fetchTmdbShowMetadata(tmdbId, options);
  if (!showMetadata) return { status: "not_found", mediaItemId: showId };

  const resolved: Array<{ seasonId: string; lookup: MatchedTvSeasonLookup }> = [];
  const missingSeasons: number[] = [];
  for (const season of seasons) {
    const lookup = await matchTvSeasonMetadataById(tmdbId, season.season_number as number, options);
    if (!lookup) {
      missingSeasons.push(season.season_number as number);
      continue;
    }
    resolved.push({ seasonId: season.id, lookup });
  }

  if (missingSeasons.length) return { status: "missing_seasons", mediaItemId: showId, missingSeasons };

  let mediaItemId = showId;
  let matchedSeasons = 0;
  let addedEpisodes = 0;

  for (const entry of resolved) {
    const result = await applyMatchedTvSeasonMetadata(mediaItemId, entry.seasonId, entry.lookup);
    matchedSeasons += 1;
    addedEpisodes += result.addedEpisodes;
    mediaItemId = result.showId;
  }

  await db
    .updateTable("media_item")
    .set({ manual_match: 1, updated_at: nowIso() })
    .where("id", "=", mediaItemId)
    .execute();

  return { status: "matched", mediaItemId, matchedSeasons, addedEpisodes };
}

export type RevertFixMatchResult =
  | { status: "matched"; mediaItemId: string }
  | { status: "unmatched"; mediaItemId: string | null }
  | { status: "no_seasons"; mediaItemId: string }
  | { status: "not_manual"; mediaItemId: string }
  | { status: "missing"; mediaItemId: null };

export type RevertFixMatchOptions = {
  movie?: RefreshMetadataOptions;
  show?: RefreshTvMetadataOptions;
};

async function clearManualMatchFlag(mediaItemId: string) {
  const db = await getDb();
  await db
    .updateTable("media_item")
    .set({ manual_match: 0, updated_at: nowIso() })
    .where("id", "=", mediaItemId)
    .execute();
}

export async function revertFixMatch(
  kind: "movie" | "show",
  mediaItemId: string,
  options: RevertFixMatchOptions = {},
): Promise<RevertFixMatchResult> {
  const db = await getDb();
  const item = await db
    .selectFrom("media_item")
    .select(["id", "manual_match"])
    .where("id", "=", mediaItemId)
    .where("kind", "=", kind)
    .executeTakeFirst();
  if (!item) return { status: "missing", mediaItemId: null };
  if (!item.manual_match) return { status: "not_manual", mediaItemId };

  await clearManualMatchFlag(mediaItemId);

  if (kind === "movie") {
    const result = await rematchMovieItemFiles(mediaItemId, options.movie);
    if (result.status === "unmatched") {
      if (result.mediaItemId && result.mediaItemId !== mediaItemId) await clearManualMatchFlag(result.mediaItemId);
      return { status: "unmatched", mediaItemId: result.mediaItemId };
    }
    // The re-match may merge this item into another item that is still
    // flagged as manual; the surviving item must not stay manual after a revert.
    if (result.mediaItemId !== mediaItemId) await clearManualMatchFlag(result.mediaItemId);
    return { status: "matched", mediaItemId: result.mediaItemId };
  }

  const result = await rematchTvShowSeasons(mediaItemId, options.show);
  if (result.status === "missing") return { status: "missing", mediaItemId: null };
  if (result.status === "unmatched") {
    if (result.mediaItemId && result.mediaItemId !== mediaItemId) await clearManualMatchFlag(result.mediaItemId);
    return { status: "unmatched", mediaItemId: result.mediaItemId };
  }
  if (result.mediaItemId !== mediaItemId) await clearManualMatchFlag(result.mediaItemId);
  return { status: result.status, mediaItemId: result.mediaItemId };
}
