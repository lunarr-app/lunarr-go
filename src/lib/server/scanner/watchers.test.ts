import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import chokidar from "chokidar";
import { closeDatabaseForTests, getDb, migrateDatabase, useDatabaseFileForTests } from "../db";
import type { Database } from "../db/schema";
import { createLibrary } from "../libraries";
import * as scanJobs from "./scan-jobs";
import { shouldReactToLibraryWatchEvent, shouldWatchLibrary, syncLibraryWatchers } from "./watchers";

describe("library scan watchers", () => {
  test("reacts to supported media and subtitle paths", () => {
    expect(shouldReactToLibraryWatchEvent("/movies/The Matrix (1999)/The Matrix.mkv")).toBe(true);
    expect(shouldReactToLibraryWatchEvent("/movies/The Matrix (1999)/The Matrix.en.vtt")).toBe(true);
    expect(shouldReactToLibraryWatchEvent("/movies/The Matrix (1999)/The Matrix.en.srt")).toBe(true);
    expect(shouldReactToLibraryWatchEvent("/movies/The Matrix (1999)")).toBe(true);
  });

  test("ignores unsupported file paths and known generated fixture cache paths", () => {
    expect(shouldReactToLibraryWatchEvent("/movies/The Matrix (1999)/poster.jpg")).toBe(false);
    expect(shouldReactToLibraryWatchEvent("/movies/.sample-video-cache/sample.mp4")).toBe(false);
  });

  test("watches local movie and TV libraries", () => {
    expect(shouldWatchLibrary({ kind: "movie", source: "local" })).toBe(true);
    expect(shouldWatchLibrary({ kind: "tv", source: "local" })).toBe(true);
    expect(shouldWatchLibrary({ kind: "movie", source: "local", watch_enabled: 0 })).toBe(false);
    expect(shouldWatchLibrary({ kind: "tv", source: "sftp" })).toBe(false);
    expect(shouldWatchLibrary({ kind: "tv", source: "webdav" })).toBe(false);
  });
});

describe("syncLibraryWatchers", () => {
  let tempDir: string;
  let db: Kysely<Database>;
  let libraryPath: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-watchers-db-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
    await migrateDatabase();
    db = await getDb();
    libraryPath = path.join(tempDir, "watched");
    await mkdir(libraryPath);
  });

  afterAll(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("starts a watcher for a local movie library", async () => {
    const libraryDir = path.join(tempDir, "watched-start");
    await mkdir(libraryDir);
    const library = await createLibrary({
      name: "Watched Library",
      kind: "movie",
      path: libraryDir,
    });

    const watchSpy = spyOn(chokidar, "watch").mockReturnValue({
      on() {
        return this;
      },
      close: async () => undefined,
    } as unknown as ReturnType<typeof chokidar.watch>);

    try {
      await syncLibraryWatchers();
      expect(watchSpy).toHaveBeenCalledTimes(1);
      expect(watchSpy.mock.calls[0][0]).toBe(await realpath(libraryDir));
    } finally {
      watchSpy.mockRestore();
    }

    await db.deleteFrom("library").where("id", "=", library.id).execute();
  });

  test("closes the watcher when a library path changes", async () => {
    const libraryDir = path.join(tempDir, "watched-moved");
    await mkdir(libraryDir);
    const library = await createLibrary({
      name: "Moved Library",
      kind: "movie",
      path: libraryDir,
    });

    const closed: string[] = [];
    const watchSpy = spyOn(chokidar, "watch").mockReturnValue({
      on() {
        return this;
      },
      close: async () => {
        closed.push("closed");
      },
    } as unknown as ReturnType<typeof chokidar.watch>);

    try {
      await syncLibraryWatchers();
      expect(watchSpy).toHaveBeenCalledTimes(1);

      const newPath = path.join(tempDir, "moved-path");
      await mkdir(newPath);
      await db
        .updateTable("library")
        .set({ path: newPath, updated_at: new Date().toISOString() })
        .where("id", "=", library.id)
        .execute();

      await syncLibraryWatchers();
      expect(closed).toEqual(["closed"]);
      expect(watchSpy).toHaveBeenCalledTimes(2);
      expect(watchSpy.mock.calls[1][0]).toBe(newPath);
    } finally {
      watchSpy.mockRestore();
    }

    await db.deleteFrom("library").where("id", "=", library.id).execute();
  });

  test("schedules a debounced scan when a chokidar event fires", async () => {
    const libraryDir = path.join(tempDir, "watched-events");
    await mkdir(libraryDir);
    const library = await createLibrary({
      name: "Watched Events",
      kind: "movie",
      path: libraryDir,
    });

    const handlers = new Map<string, () => void>();
    const watchSpy = spyOn(chokidar, "watch").mockReturnValue({
      on(event: string, handler: () => void) {
        handlers.set(event, handler);
        return this;
      },
      close: async () => undefined,
    } as unknown as ReturnType<typeof chokidar.watch>);

    const startSpy = spyOn(scanJobs, "startScan").mockResolvedValue(library.id);
    try {
      await syncLibraryWatchers();
      expect(handlers.has("add")).toBe(true);

      handlers.get("add")?.();
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && startSpy.mock.calls.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(startSpy.mock.calls[0][0]).toBe(library.id);
    } finally {
      startSpy.mockRestore();
      watchSpy.mockRestore();
    }

    await db.deleteFrom("library").where("id", "=", library.id).execute();
  }, 15_000);
});
