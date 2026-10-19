import { SEGMENT_LABELS } from "#lib/playback/segments.js";
import { createTtlCache } from "#lib/server/cache/ttl-cache.js";
import { getDb } from "#lib/server/db/index.js";
import type { PlaybackSegment, PlaybackSegmentType } from "#lib/server/playback/index.js";
import { getMedia } from "theintrodb";
import type { GetMediaParams, MediaRecord, NormalizedSegmentTimestamp } from "theintrodb";

const INTRODB_FETCH_TIMEOUT_MS = 3_000;
const INTRODB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const INTRODB_CACHE_MAX_ENTRIES = 500;
const ENABLED_SEGMENT_TYPES = new Set<PlaybackSegmentType>(["intro", "recap", "credits"]);

const introDbCache = createTtlCache<MediaRecord>({
  ttlMs: INTRODB_CACHE_TTL_MS,
  maxEntries: INTRODB_CACHE_MAX_ENTRIES,
});

function introDbCacheKey(params: GetMediaParams) {
  const parts: string[] = [];
  if (params.tvdbId !== undefined) parts.push(`tvdb${params.tvdbId}`);
  if (params.tmdbId !== undefined) parts.push(`tmdb${params.tmdbId}`);
  if (params.imdbId !== undefined) parts.push(`imdb${params.imdbId}`);
  if (params.season !== undefined) parts.push(`s${params.season}`);
  if (params.episode !== undefined) parts.push(`e${params.episode}`);
  if (params.mapping !== undefined) parts.push(`m${params.mapping}`);
  if (params.tvdbEpisodeId !== undefined) parts.push(`te${params.tvdbEpisodeId}`);
  if (params.durationMs !== undefined) parts.push(`d${params.durationMs}`);
  return parts.join(":");
}

export async function introDbLookupForMediaItem(mediaItemId: string): Promise<GetMediaParams | null> {
  const db = await getDb();
  const row = await db
    .selectFrom("media_item as item")
    .leftJoin("media_item as season", (join) =>
      join.onRef("season.id", "=", "item.parent_id").on("item.kind", "=", "episode").on("season.kind", "=", "season"),
    )
    .leftJoin("media_item as show", (join) =>
      join.onRef("show.id", "=", "season.parent_id").on("show.kind", "=", "show"),
    )
    .select([
      "item.kind",
      "item.provider",
      "item.provider_id",
      "item.season_number",
      "item.episode_number",
      "item.parent_id",
      "show.provider as show_provider",
      "show.provider_id as show_provider_id",
    ])
    .where("item.id", "=", mediaItemId)
    .executeTakeFirst();

  if (!row) return null;

  if (row.kind === "movie") {
    const tmdbId = tmdbIdFromMetadata(row.provider, row.provider_id);
    return tmdbId ? { tmdbId } : null;
  }

  if (row.kind !== "episode") return null;
  if (row.season_number === null || row.episode_number === null || !row.parent_id) return null;

  const tmdbId = tmdbIdFromMetadata(row.show_provider, row.show_provider_id);
  if (!tmdbId) return null;

  return { tmdbId, season: row.season_number, episode: row.episode_number };
}

export function playbackSegmentsFromMediaRecord(record: MediaRecord): PlaybackSegment[] {
  const segments: PlaybackSegment[] = [];

  const sources: Array<[PlaybackSegmentType, NormalizedSegmentTimestamp[]]> = [
    ["intro", record.intro],
    ["recap", record.recap],
    ["credits", record.credits],
  ];

  for (const [type, timestamps] of sources) {
    if (!ENABLED_SEGMENT_TYPES.has(type)) continue;
    for (const timestamp of timestamps) {
      const segment = playbackSegmentFromTimestamp(type, timestamp);
      if (segment) segments.push(segment);
    }
  }

  return segments;
}

export function clampPlaybackSegments(
  segments: PlaybackSegment[],
  durationSeconds: number | null | undefined,
): PlaybackSegment[] {
  if (!Number.isFinite(durationSeconds) || Number(durationSeconds) <= 0) {
    return segments;
  }

  const duration = Number(durationSeconds);
  return segments.flatMap((segment) => {
    const startSeconds = Math.min(Math.max(0, segment.startSeconds), duration);
    const endSeconds =
      segment.endSeconds === null ? duration : Math.min(Math.max(startSeconds, segment.endSeconds), duration);
    if (endSeconds <= startSeconds) return [];
    return [{ ...segment, startSeconds, endSeconds }];
  });
}

export async function loadPlaybackSegmentsForMediaItem(
  mediaItemId: string,
  durationSeconds: number | null | undefined,
): Promise<PlaybackSegment[]> {
  const introDbLookup = await introDbLookupForMediaItem(mediaItemId);
  if (!introDbLookup) return [];

  const introDbRecord = await fetchIntroDbMedia(introDbLookup, durationSeconds);
  return clampPlaybackSegments(introDbRecord ? playbackSegmentsFromMediaRecord(introDbRecord) : [], durationSeconds);
}

export async function fetchIntroDbMedia(
  lookup: GetMediaParams,
  durationSeconds?: number | null,
): Promise<MediaRecord | null> {
  const durationMs =
    Number.isFinite(durationSeconds) && Number(durationSeconds) > 0
      ? Math.round(Number(durationSeconds) * 1000)
      : undefined;
  const params = durationMs === undefined ? lookup : { ...lookup, durationMs };
  const cacheKey = introDbCacheKey(params);
  const cached = introDbCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTRODB_FETCH_TIMEOUT_MS);

  try {
    const response = await getMedia(params, { signal: controller.signal });
    if (response.kind !== "media") return null;
    introDbCache.set(cacheKey, response);
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function playbackSegmentFromTimestamp(
  type: PlaybackSegmentType,
  timestamp: NormalizedSegmentTimestamp,
): PlaybackSegment | null {
  const startSeconds = timestamp.startMs / 1000;
  const endSeconds = timestamp.endMs === null ? null : timestamp.endMs / 1000;

  if (endSeconds !== null && endSeconds <= startSeconds) return null;

  return {
    type,
    startSeconds,
    endSeconds,
    label: SEGMENT_LABELS[type].skip,
  };
}

function tmdbIdFromMetadata(provider: string | null | undefined, providerId: string | null | undefined) {
  if (provider !== "tmdb" || !providerId) return null;
  const parsed = Number.parseInt(providerId, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
