import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";
import { appEnv } from "../config/env";
import { listLibraries } from "../libraries";
import { isSidecarSubtitlePath, isVideoFilePath } from "./media-files";
import { startScan } from ".";

type WatchedLibrary = {
  id: string;
  path: string;
  watcher: FSWatcher;
  timer: ReturnType<typeof setTimeout> | null;
};

const watchedLibraries = new Map<string, WatchedLibrary>();
let syncPromise: Promise<void> | null = null;

function isIgnoredFixtureCache(filePath: string) {
  return filePath.split(path.sep).includes(".sample-video-cache");
}

export function shouldReactToLibraryWatchEvent(filePath: string, stats?: { isFile(): boolean }) {
  if (isIgnoredFixtureCache(filePath)) return false;
  if (stats && !stats.isFile()) return true;
  if (!stats && !path.extname(filePath)) return true;
  return isVideoFilePath(filePath) || isSidecarSubtitlePath(filePath);
}

export function shouldWatchLibrary(library: { kind: string; source: string }) {
  return (library.kind === "movie" || library.kind === "tv") && library.source === "local";
}

function scheduleScan(libraryId: string) {
  const watched = watchedLibraries.get(libraryId);
  if (!watched) return;

  if (watched.timer) clearTimeout(watched.timer);
  watched.timer = setTimeout(() => {
    watched.timer = null;
    startScan(libraryId).catch((error) => {
      console.error(`Could not start watched scan for library ${libraryId}:`, error);
    });
  }, appEnv.LUNARR_WATCH_DEBOUNCE_MS);
}

async function closeWatchedLibrary(libraryId: string) {
  const watched = watchedLibraries.get(libraryId);
  if (!watched) return;
  watchedLibraries.delete(libraryId);
  if (watched.timer) clearTimeout(watched.timer);
  await watched.watcher.close();
}

function watchLibrary(library: { id: string; path: string }) {
  const watcher = chokidar.watch(library.path, {
    persistent: false,
    ignoreInitial: true,
    atomic: 1_000,
    usePolling: appEnv.LUNARR_WATCH_USE_POLLING,
    interval: appEnv.LUNARR_WATCH_INTERVAL_MS,
    binaryInterval: appEnv.LUNARR_WATCH_BINARY_INTERVAL_MS,
    awaitWriteFinish: {
      stabilityThreshold: appEnv.LUNARR_WATCH_WRITE_STABILITY_MS,
      pollInterval: appEnv.LUNARR_WATCH_INTERVAL_MS
    },
    ignored: (filePath, stats) => !shouldReactToLibraryWatchEvent(filePath, stats)
  });

  const watched: WatchedLibrary = {
    id: library.id,
    path: library.path,
    watcher,
    timer: null
  };
  watchedLibraries.set(library.id, watched);

  watcher
    .on("add", () => scheduleScan(library.id))
    .on("change", () => scheduleScan(library.id))
    .on("unlink", () => scheduleScan(library.id))
    .on("addDir", () => scheduleScan(library.id))
    .on("unlinkDir", () => scheduleScan(library.id))
    .on("error", (error) => {
      console.error(`Library watcher error for ${library.path}:`, error);
    });
}

export async function syncLibraryWatchers() {
  syncPromise ??= (async () => {
    const libraries = (await listLibraries()).filter(shouldWatchLibrary);
    const activeIds = new Set(libraries.map((library) => library.id));

    for (const [libraryId, watched] of watchedLibraries) {
      const current = libraries.find((library) => library.id === libraryId);
      if (!current || current.path !== watched.path) {
        await closeWatchedLibrary(libraryId);
      }
    }

    for (const library of libraries) {
      if (!activeIds.has(library.id)) continue;
      if (!watchedLibraries.has(library.id)) {
        watchLibrary(library);
      }
    }
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}

export async function closeLibraryWatchers() {
  const ids = [...watchedLibraries.keys()];
  await Promise.all(ids.map((id) => closeWatchedLibrary(id)));
}
