import { DEFAULT_MOVIE_METADATA_STALENESS_DAYS, DEFAULT_TV_METADATA_STALENESS_DAYS } from "$lib/metadata/settings";
import { getSetting, setSetting } from "../settings";

const MIN_REFRESH_INTERVAL_HOURS = 1;
const MAX_REFRESH_INTERVAL_HOURS = 30 * 24; // 30 days

const MIN_STALENESS_DAYS = 0;
const MAX_STALENESS_DAYS = 3650;

const MOVIE_INTERVAL_KEY = "movie_metadata_refresh_interval_hours";
const TV_INTERVAL_KEY = "tv_metadata_refresh_interval_hours";

const MOVIE_STALENESS_KEY = "movie_metadata_staleness_days";
const TV_STALENESS_KEY = "tv_metadata_staleness_days";

const MOVIE_LAST_SCHEDULED_AT_KEY = "movie_metadata_last_scheduled_refresh_at";
const TV_LAST_SCHEDULED_AT_KEY = "tv_metadata_last_scheduled_refresh_at";

export type MetadataKind = "movie" | "tv";

function intervalKey(kind: MetadataKind) {
  return kind === "movie" ? MOVIE_INTERVAL_KEY : TV_INTERVAL_KEY;
}

function stalenessKey(kind: MetadataKind) {
  return kind === "movie" ? MOVIE_STALENESS_KEY : TV_STALENESS_KEY;
}

function lastScheduledAtKey(kind: MetadataKind) {
  return kind === "movie" ? MOVIE_LAST_SCHEDULED_AT_KEY : TV_LAST_SCHEDULED_AT_KEY;
}

function defaultMetadataStalenessDays(kind: MetadataKind) {
  return kind === "movie" ? DEFAULT_MOVIE_METADATA_STALENESS_DAYS : DEFAULT_TV_METADATA_STALENESS_DAYS;
}

export function normalizeRefreshIntervalHours(value: number | null | undefined): number | null {
  if (value === null || value === undefined || value === 0) return null;
  if (!Number.isInteger(value)) return null;
  if (value < MIN_REFRESH_INTERVAL_HOURS || value > MAX_REFRESH_INTERVAL_HOURS) return null;
  return value;
}

export function normalizeStalenessDays(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return MIN_STALENESS_DAYS;
  const integer = Math.floor(value);
  if (!Number.isFinite(integer)) return MIN_STALENESS_DAYS;
  if (integer < MIN_STALENESS_DAYS) return MIN_STALENESS_DAYS;
  if (integer > MAX_STALENESS_DAYS) return MAX_STALENESS_DAYS;
  return integer;
}

export async function getMetadataRefreshIntervalHours(kind: MetadataKind): Promise<number | null> {
  const raw = await getSetting(intervalKey(kind));
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  const normalized = normalizeRefreshIntervalHours(parsed);
  return normalized;
}

export async function setMetadataRefreshIntervalHours(kind: MetadataKind, hours: number | null | undefined) {
  const normalized = normalizeRefreshIntervalHours(hours);
  if (normalized === null) {
    await setSetting(intervalKey(kind), "0");
  } else {
    await setSetting(intervalKey(kind), String(normalized));
  }
}

export async function getMetadataStalenessDays(kind: MetadataKind): Promise<number> {
  const raw = await getSetting(stalenessKey(kind));
  if (raw === null) return defaultMetadataStalenessDays(kind);
  const parsed = Number.parseInt(raw, 10);
  return normalizeStalenessDays(parsed);
}

export async function setMetadataStalenessDays(kind: MetadataKind, days: number | null | undefined) {
  const normalized = normalizeStalenessDays(days ?? MIN_STALENESS_DAYS);
  await setSetting(stalenessKey(kind), String(normalized));
}

export async function getLastScheduledMetadataRefreshAt(kind: MetadataKind): Promise<string | null> {
  return getSetting(lastScheduledAtKey(kind));
}

export async function setLastScheduledMetadataRefreshAt(kind: MetadataKind, isoTimestamp: string) {
  await setSetting(lastScheduledAtKey(kind), isoTimestamp);
}
