import { getDb } from "../db";
import { listLibraries } from "../libraries";
import { MAX_SCHEDULED_TIMEOUT_MS, nowIso } from "../time";
import { startScan } from "./scan-jobs";

type SchedulableLibrary = {
  id: string;
  kind: string;
  created_at: string;
  updated_at: string;
  scan_interval_minutes: number | null;
  last_scheduled_scan_at: string | null;
};

const scheduledScanTimers = new Map<string, ReturnType<typeof setTimeout>>();
let syncPromise: Promise<void> | null = null;

function isScannableLibraryKind(kind: string) {
  return kind === "movie" || kind === "tv";
}

export function shouldScheduleLibraryScan(library: { kind: string; scan_interval_minutes: number | null }) {
  const intervalMinutes = library.scan_interval_minutes;
  return (
    isScannableLibraryKind(library.kind) &&
    intervalMinutes !== null &&
    Number.isInteger(intervalMinutes) &&
    intervalMinutes > 0
  );
}

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function scheduledScanDelayMs(library: SchedulableLibrary, nowMs = Date.now()) {
  if (!shouldScheduleLibraryScan(library)) return null;
  const intervalMinutes = library.scan_interval_minutes;
  if (!intervalMinutes) return null;

  const anchorMs =
    timestampMs(library.last_scheduled_scan_at) ??
    timestampMs(library.updated_at) ??
    timestampMs(library.created_at) ??
    nowMs;
  const dueMs = anchorMs + intervalMinutes * 60_000;
  return Math.max(0, Math.min(dueMs - nowMs, MAX_SCHEDULED_TIMEOUT_MS));
}

function clearScheduledScanTimer(libraryId: string) {
  const timer = scheduledScanTimers.get(libraryId);
  if (!timer) return;
  clearTimeout(timer);
  scheduledScanTimers.delete(libraryId);
}

async function runScheduledScan(libraryId: string) {
  clearScheduledScanTimer(libraryId);

  try {
    const db = await getDb();
    const library = await db
      .selectFrom("library")
      .select(["id", "kind", "created_at", "updated_at", "scan_interval_minutes", "last_scheduled_scan_at"])
      .where("id", "=", libraryId)
      .executeTakeFirst();

    if (!library || !shouldScheduleLibraryScan(library)) return;
    const remainingDelayMs = scheduledScanDelayMs(library);
    if (remainingDelayMs === null || remainingDelayMs > 0) return;

    await db.updateTable("library").set({ last_scheduled_scan_at: nowIso() }).where("id", "=", libraryId).execute();

    await startScan(libraryId);
  } catch (error) {
    console.error(`Could not start scheduled scan for library ${libraryId}:`, error);
  } finally {
    await syncScheduledLibraryScans().catch((error) => {
      console.error("Could not resync scheduled library scans:", error);
    });
  }
}

function scheduleLibraryScan(library: SchedulableLibrary) {
  const delayMs = scheduledScanDelayMs(library);
  if (delayMs === null) return;

  const timer = setTimeout(() => {
    void runScheduledScan(library.id);
  }, delayMs);
  timer.unref?.();
  scheduledScanTimers.set(library.id, timer);
}

export async function syncScheduledLibraryScans() {
  syncPromise ??= (async () => {
    const libraries = (await listLibraries()).filter(shouldScheduleLibraryScan);

    for (const libraryId of scheduledScanTimers.keys()) {
      clearScheduledScanTimer(libraryId);
    }

    for (const library of libraries) {
      scheduleLibraryScan(library);
    }
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}
