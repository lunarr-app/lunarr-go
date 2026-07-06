import { building } from "$app/environment";
import { MAX_SCHEDULED_TIMEOUT_MS } from "../scheduling/timeout";
import { nowIso } from "../time";
import { tmdbCredentialsConfigured } from "./tmdb";
import {
  getLastScheduledMetadataRefreshAt,
  getMetadataRefreshIntervalHours,
  getMetadataStalenessDays,
  setLastScheduledMetadataRefreshAt,
} from "./settings";
import type { MetadataKind } from "./settings";
import { startMovieMetadataRefreshJob } from "./movies";
import { startTvMetadataRefreshJob } from "./tv";

type TimerMap = Map<MetadataKind, ReturnType<typeof setTimeout>>;

const timers: TimerMap = new Map();
let syncPromise: Promise<void> | null = null;

export function scheduledMetadataRefreshDelayMs(options: {
  intervalHours: number | null;
  lastScheduledAt: string | null;
  nowMs?: number;
}): number | null {
  const { intervalHours, lastScheduledAt } = options;
  const nowMs = options.nowMs ?? Date.now();
  if (!intervalHours || intervalHours <= 0) return null;

  const intervalMs = intervalHours * 3_600_000;
  const anchorMs = lastScheduledAt ? Date.parse(lastScheduledAt) : NaN;
  const effectiveAnchor = Number.isFinite(anchorMs) ? anchorMs : nowMs;
  const dueMs = effectiveAnchor + intervalMs;
  const remaining = dueMs - nowMs;
  if (remaining <= 0) return 0;
  return Math.max(0, Math.min(remaining, MAX_SCHEDULED_TIMEOUT_MS));
}

function clearMetadataTimer(kind: MetadataKind) {
  const existing = timers.get(kind);
  if (!existing) return;
  clearTimeout(existing);
  timers.delete(kind);
}

async function runScheduledMetadataRefresh(kind: MetadataKind) {
  clearMetadataTimer(kind);

  try {
    if (building) return;
    const intervalHours = await getMetadataRefreshIntervalHours(kind);
    if (!intervalHours || !(await tmdbCredentialsConfigured())) return;

    const stalenessDays = await getMetadataStalenessDays(kind);
    const now = nowIso();
    await setLastScheduledMetadataRefreshAt(kind, now);

    if (kind === "movie") {
      await startMovieMetadataRefreshJob({ stalenessDays });
    } else {
      await startTvMetadataRefreshJob({ stalenessDays });
    }
  } finally {
    await syncScheduledMetadataRefresh().catch((error) => {
      console.error("Could not resync scheduled metadata refresh timers:", error);
    });
  }
}

function scheduleMetadataRefresh(kind: MetadataKind, intervalHours: number | null, lastScheduledAt: string | null) {
  const delayMs = scheduledMetadataRefreshDelayMs({ intervalHours, lastScheduledAt });
  if (delayMs === null) return;

  const timer = setTimeout(() => {
    void runScheduledMetadataRefresh(kind);
  }, delayMs);
  timer.unref?.();
  timers.set(kind, timer);
}

export async function syncScheduledMetadataRefresh() {
  syncPromise ??= (async () => {
    const [movieInterval, tvInterval, movieLast, tvLast] = await Promise.all([
      getMetadataRefreshIntervalHours("movie"),
      getMetadataRefreshIntervalHours("tv"),
      getLastScheduledMetadataRefreshAt("movie"),
      getLastScheduledMetadataRefreshAt("tv"),
    ]);

    clearMetadataTimer("movie");
    clearMetadataTimer("tv");

    if (!building) {
      scheduleMetadataRefresh("movie", movieInterval, movieLast);
      scheduleMetadataRefresh("tv", tvInterval, tvLast);
    }
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}
