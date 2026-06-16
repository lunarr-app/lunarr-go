import { Readable } from "node:stream";
import type { LibrarySource } from "../db/schema";
import { createLocalStorage } from "./local";
import { createSftpStorage, sftpOperationTimeoutMsFromLibraryConfig } from "./sftp";
import { DEFAULT_REMOTE_OPERATION_TIMEOUT_MS, type StorageFileInfo, type StorageWalkEntry } from "./remote";
import { createWebdavStorage, webdavOperationTimeoutMsFromConfig } from "./webdav";
import type { LibraryStorage, StoredLibrary } from "./types";

export type { StorageFileInfo, StorageWalkEntry };
export {
  DEFAULT_REMOTE_OPERATION_TIMEOUT_MS,
  normalizeRemoteOperationTimeoutMs,
  normalizeRemotePath,
  normalizeRemoteWalkConcurrency,
} from "./remote";
export { parseWebdavConfig, testWebdavConnection, webdavDisplayPath, type WebdavLibraryConfig } from "./webdav";
export type { LibraryStorage, SftpLibraryConfig } from "./types";
export { createLocalStorage } from "./local";
export { parseSftpConfig, sftpDisplayPath, testSftpConnection } from "./sftp";

export function remoteOperationTimeoutMsFromConfig(source: LibrarySource, configJson: string | null) {
  if (source === "sftp") return sftpOperationTimeoutMsFromLibraryConfig(configJson);
  if (source === "webdav") return webdavOperationTimeoutMsFromConfig(configJson);
  return DEFAULT_REMOTE_OPERATION_TIMEOUT_MS;
}

export async function createLibraryStorage(library: StoredLibrary): Promise<LibraryStorage> {
  if (library.source === "sftp") return createSftpStorage(library.config_json);
  if (library.source === "webdav") return createWebdavStorage(library.config_json);
  return createLocalStorage();
}

function createTestRemoteLibraryStorage(source: Exclude<LibrarySource, "local">): LibraryStorage {
  return {
    source,
    async statFile() {
      return null;
    },
    async listFiles() {
      return null;
    },
    async *walkFiles() {
      return;
    },
    async createReadStream(_filePath, range) {
      if (!range) throw new Error("Expected a range read.");
      return Readable.from(Buffer.alloc(range.end - range.start + 1, 0));
    },
    async close() {
      return;
    },
  };
}

export async function createDefaultLibraryStorageForTests(library: StoredLibrary): Promise<LibraryStorage> {
  if (library.source === "sftp" || library.source === "webdav") {
    return createTestRemoteLibraryStorage(library.source);
  }
  return createLibraryStorage(library);
}
