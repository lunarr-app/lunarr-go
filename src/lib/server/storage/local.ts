import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { StorageFileInfo, StorageWalkEntry } from "./remote";
import type { LibraryStorage } from "./types";

function fileInfoFromLocalPath(filePath: string, info: { size: number; mtimeMs: number }): StorageFileInfo {
  return {
    path: filePath,
    basename: path.basename(filePath),
    extension: path.extname(filePath).toLowerCase(),
    size: info.size,
    mtimeMs: Math.round(info.mtimeMs),
  };
}

async function* walkLocalFiles(root: string): AsyncGenerator<StorageWalkEntry> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    yield { kind: "error", path: root, error };
    return;
  }

  const directories: string[] = [];
  const files: StorageFileInfo[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      directories.push(fullPath);
    } else if (entry.isFile()) {
      try {
        const info = await stat(fullPath);
        files.push(fileInfoFromLocalPath(fullPath, info));
      } catch (error) {
        yield { kind: "error", path: fullPath, error };
      }
    }
  }

  yield { kind: "directory", path: root, files };
  for (const file of files) {
    yield { kind: "file", path: file.path, file };
  }
  for (const directory of directories) {
    yield* walkLocalFiles(directory);
  }
}

export function createLocalStorage(): LibraryStorage {
  return {
    source: "local",
    async statFile(filePath) {
      try {
        const info = await stat(filePath);
        if (!info.isFile()) return null;
        return fileInfoFromLocalPath(filePath, info);
      } catch {
        return null;
      }
    },
    async listFiles(directory) {
      try {
        const entries = await readdir(directory, { withFileTypes: true });
        const files: StorageFileInfo[] = [];
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const filePath = path.join(directory, entry.name);
          const info = await stat(filePath);
          files.push(fileInfoFromLocalPath(filePath, info));
        }
        return files;
      } catch {
        return null;
      }
    },
    walkFiles: walkLocalFiles,
    async createReadStream(filePath, range) {
      return createReadStream(filePath, range ? { start: range.start, end: range.end } : undefined);
    },
    async close() {
      return;
    },
  };
}
