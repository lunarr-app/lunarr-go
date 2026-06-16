import path from "node:path";
import type { LibraryKind, LibrarySource } from "../db/schema";
import { getDb } from "../db";

export const MIN_SCAN_INTERVAL_MINUTES = 5;
export const MAX_SCAN_INTERVAL_MINUTES = 43_200;

export function pathsOverlap(left: string, right: string) {
  const relative = path.relative(left, right);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function remotePathsOverlap(left: string, right: string) {
  const relative = path.posix.relative(left, right);
  return relative === "" || (!relative.startsWith("..") && !path.posix.isAbsolute(relative));
}

export function assertSupportedLibraryKind(kind: LibraryKind) {
  if (kind !== "movie" && kind !== "tv") throw new Error("Unsupported library kind.");
}

export function normalizeWatchEnabled(source: LibrarySource, value: boolean | undefined) {
  if (source !== "local") return 0;
  return value === false ? 0 : 1;
}

export function normalizeScanIntervalMinutes(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return null;
  if (!Number.isInteger(value) || value < MIN_SCAN_INTERVAL_MINUTES || value > MAX_SCAN_INTERVAL_MINUTES) {
    throw new Error(`Scheduled scan interval must be between ${MIN_SCAN_INTERVAL_MINUTES} minutes and 30 days.`);
  }
  return value;
}

export async function activeScanExists(libraryId: string) {
  const db = await getDb();
  const activeScan = await db
    .selectFrom("scan_job")
    .select("id")
    .where("library_id", "=", libraryId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();
  return Boolean(activeScan);
}
