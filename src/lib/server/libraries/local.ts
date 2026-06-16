import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { getDb } from "../db";
import { createId } from "../id";
import { nowIso } from "../time";
import {
  assertSupportedLibraryKind,
  normalizeScanIntervalMinutes,
  normalizeWatchEnabled,
  pathsOverlap,
} from "./shared";
import type { CreateLocalLibraryInput, UpdateLocalLibraryInput } from "./types";

export async function createLocalLibrary(input: CreateLocalLibraryInput) {
  const cleanPath = input.path.trim();
  const cleanName = input.name.trim() || path.basename(cleanPath);
  if (!cleanPath) throw new Error("Library path is required.");
  assertSupportedLibraryKind(input.kind);

  let resolved: string;
  try {
    resolved = await realpath(cleanPath);
  } catch {
    throw new Error("Library path does not exist.");
  }

  const info = await stat(resolved);
  if (!info.isDirectory()) throw new Error("Library path must be a directory.");
  try {
    await access(resolved, constants.R_OK);
  } catch {
    throw new Error("Library path is not readable.");
  }

  const db = await getDb();
  const existing = await db.selectFrom("library").select("id").where("path", "=", resolved).executeTakeFirst();
  if (existing) throw new Error("Library path is already configured.");

  const libraries = await db.selectFrom("library").select(["path"]).execute();
  const overlapping = libraries.find(
    (library) => pathsOverlap(library.path, resolved) || pathsOverlap(resolved, library.path),
  );
  if (overlapping) throw new Error("Library path overlaps with an existing library.");

  const now = nowIso();
  const library = {
    id: createId(),
    name: cleanName,
    kind: input.kind,
    source: "local" as const,
    access_mode: "all" as const,
    path: resolved,
    config_json: null,
    watch_enabled: normalizeWatchEnabled("local", input.watchEnabled),
    scan_interval_minutes: normalizeScanIntervalMinutes(input.scanIntervalMinutes),
    last_scheduled_scan_at: null,
    created_at: now,
    updated_at: now,
  };

  await db.insertInto("library").values(library).execute();
  return library;
}

type UpdateLocalLibraryParams = {
  id: string;
  input: UpdateLocalLibraryInput;
  watchEnabled: number;
  scanIntervalMinutes: number | null;
  resetScheduledScanAt: Partial<{ last_scheduled_scan_at: null }>;
};

export async function updateLocalLibrary({
  id,
  input,
  watchEnabled,
  scanIntervalMinutes,
  resetScheduledScanAt,
}: UpdateLocalLibraryParams) {
  const db = await getDb();
  const cleanPath = input.path.trim();
  const cleanName = input.name.trim() || path.basename(cleanPath);
  if (!cleanPath) throw new Error("Library path is required.");

  let resolved: string;
  try {
    resolved = await realpath(cleanPath);
  } catch {
    throw new Error("Library path does not exist.");
  }

  const info = await stat(resolved);
  if (!info.isDirectory()) throw new Error("Library path must be a directory.");
  try {
    await access(resolved, constants.R_OK);
  } catch {
    throw new Error("Library path is not readable.");
  }

  const duplicate = await db
    .selectFrom("library")
    .select("id")
    .where("path", "=", resolved)
    .where("id", "!=", id)
    .executeTakeFirst();
  if (duplicate) throw new Error("Library path is already configured.");

  const libraries = await db.selectFrom("library").select(["id", "path"]).where("id", "!=", id).execute();
  const overlapping = libraries.find(
    (library) => pathsOverlap(library.path, resolved) || pathsOverlap(resolved, library.path),
  );
  if (overlapping) throw new Error("Library path overlaps with an existing library.");

  const now = nowIso();
  await db
    .updateTable("library")
    .set({
      name: cleanName,
      path: resolved,
      config_json: null,
      watch_enabled: watchEnabled,
      scan_interval_minutes: scanIntervalMinutes,
      ...resetScheduledScanAt,
      updated_at: now,
    })
    .where("id", "=", id)
    .execute();
}
