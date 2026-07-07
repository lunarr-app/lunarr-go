import { segmentSkipLabel } from "$lib/playback/segments";
import { getDb } from "$lib/server/db";
import type { PlaybackSegment, PlaybackSegmentType } from "$lib/server/playback";
import { getMedia, type GetMediaParams, type MediaRecord, type NormalizedSegmentTimestamp } from "theintrodb";

const INTRODB_FETCH_TIMEOUT_MS = 3_000;
const ENABLED_SEGMENT_TYPES = new Set<PlaybackSegmentType>(["intro", "recap", "credits"]);

export async function introDbLookupForMediaItem(mediaItemId: string): Promise<GetMediaParams | null> {
  const db = await getDb();
  const item = await db
    .selectFrom("media_item")
    .select(["id", "kind", "provider", "provider_id", "season_number", "episode_number", "parent_id"])
    .where("id", "=", mediaItemId)
    .executeTakeFirst();

  if (!item) return null;

  if (item.kind === "movie") {
    const tmdbId = tmdbIdFromMetadata(item.provider, item.provider_id);
    return tmdbId ? { tmdbId } : null;
  }

  if (item.kind !== "episode") return null;
  if (item.season_number === null || item.episode_number === null || !item.parent_id) return null;

  const season = await db
    .selectFrom("media_item")
    .select(["parent_id"])
    .where("id", "=", item.parent_id)
    .executeTakeFirst();
  if (!season?.parent_id) return null;

  const show = await db
    .selectFrom("media_item")
    .select(["provider", "provider_id"])
    .where("id", "=", season.parent_id)
    .executeTakeFirst();
  if (!show) return null;

  const tmdbId = tmdbIdFromMetadata(show.provider, show.provider_id);
  if (!tmdbId) return null;

  return { tmdbId, season: item.season_number, episode: item.episode_number };
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

export async function fetchIntroDbMedia(
  lookup: GetMediaParams,
  durationSeconds?: number | null,
): Promise<MediaRecord | null> {
  const durationMs =
    Number.isFinite(durationSeconds) && Number(durationSeconds) > 0
      ? Math.round(Number(durationSeconds) * 1000)
      : undefined;
  const params = durationMs === undefined ? lookup : { ...lookup, durationMs };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTRODB_FETCH_TIMEOUT_MS);

  try {
    return await getMedia(params, { signal: controller.signal });
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
    label: segmentSkipLabel(type),
  };
}

function tmdbIdFromMetadata(provider: string | null | undefined, providerId: string | null | undefined) {
  if (provider !== "tmdb" || !providerId) return null;
  const parsed = Number.parseInt(providerId, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
