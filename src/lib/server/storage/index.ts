import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Client, type ConnectConfig, type FileEntryWithStats, type SFTPWrapper, type Stats } from "ssh2";
import type { LibrarySource } from "../db/schema";
import { decryptSecret } from "../secrets";
import {
  DEFAULT_REMOTE_OPERATION_TIMEOUT_MS,
  DEFAULT_REMOTE_WALK_CONCURRENCY,
  fileInfoFromRemotePath,
  normalizeRemoteOperationTimeoutMs,
  normalizeRemotePath,
  normalizeRemoteWalkConcurrency,
  remoteErrorMessage,
  walkRemoteFiles,
  withTimeout,
  type RemoteDirectoryEntry,
  type StorageFileInfo,
  type StorageWalkEntry,
} from "./remote";
import {
  createWebdavStorage,
  parseWebdavConfig,
  testWebdavConnection,
  webdavDisplayPath,
  webdavOperationTimeoutMsFromConfig,
  type WebdavLibraryConfig,
} from "./webdav";

export type { StorageFileInfo, StorageWalkEntry, RemoteDirectoryEntry };
export {
  DEFAULT_REMOTE_OPERATION_TIMEOUT_MS,
  DEFAULT_REMOTE_WALK_CONCURRENCY,
  MAX_REMOTE_OPERATION_TIMEOUT_MS,
  MAX_REMOTE_WALK_CONCURRENCY,
  MIN_REMOTE_OPERATION_TIMEOUT_MS,
  MIN_REMOTE_WALK_CONCURRENCY,
  normalizeRemoteOperationTimeoutMs,
  normalizeRemotePath,
  normalizeRemoteWalkConcurrency,
  walkRemoteFiles,
} from "./remote";
export {
  createWebdavStorage,
  parseWebdavConfig,
  testWebdavConnection,
  webdavDisplayPath,
  webdavOperationTimeoutMsFromConfig,
  type WebdavLibraryConfig,
} from "./webdav";

export type LibraryStorage = {
  source: LibrarySource;
  root?: string;
  statFile(filePath: string): Promise<StorageFileInfo | null>;
  listFiles(directory: string): Promise<StorageFileInfo[] | null>;
  walkFiles(root: string): AsyncGenerator<StorageWalkEntry>;
  createReadStream(
    filePath: string,
    range?: { start: number; end: number },
    options?: { keepOpen?: boolean },
  ): Promise<Readable>;
  operationTimeoutMs?: number;
  close(): Promise<void>;
};

export type SftpLibraryConfig = {
  host: string;
  port: number;
  username: string;
  root: string;
  passwordEncrypted: string;
  walkConcurrency: number;
  operationTimeoutMs: number;
};

type StoredLibrary = {
  source?: LibrarySource | null;
  config_json: string | null;
};

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

export function parseSftpConfig(configJson: string | null): SftpLibraryConfig {
  if (!configJson) throw new Error("SFTP library is missing connection config.");
  const parsed = JSON.parse(configJson) as Partial<SftpLibraryConfig>;
  if (!parsed.host || !parsed.username || !parsed.root || !parsed.passwordEncrypted) {
    throw new Error("SFTP library config is incomplete.");
  }

  return {
    host: parsed.host,
    port: Number(parsed.port || 22),
    username: parsed.username,
    root: normalizeRemotePath(parsed.root),
    passwordEncrypted: parsed.passwordEncrypted,
    walkConcurrency: normalizeRemoteWalkConcurrency(parsed.walkConcurrency),
    operationTimeoutMs: normalizeRemoteOperationTimeoutMs(parsed.operationTimeoutMs),
  };
}

export function sftpOperationTimeoutMsFromConfig(configJson: string | null) {
  try {
    return parseSftpConfig(configJson).operationTimeoutMs;
  } catch {
    return DEFAULT_REMOTE_OPERATION_TIMEOUT_MS;
  }
}

export function remoteOperationTimeoutMsFromConfig(source: LibrarySource, configJson: string | null) {
  if (source === "sftp") return sftpOperationTimeoutMsFromConfig(configJson);
  if (source === "webdav") return webdavOperationTimeoutMsFromConfig(configJson);
  return DEFAULT_REMOTE_OPERATION_TIMEOUT_MS;
}

export function sftpDisplayPath(input: { host: string; port: number; username: string; root: string }) {
  return `sftp://${input.username}@${input.host}:${input.port}${input.root.startsWith("/") ? input.root : `/${input.root}`}`;
}

function sftpConnect(config: SftpLibraryConfig) {
  const client = new Client();
  const connectConfig: ConnectConfig = {
    host: config.host,
    port: config.port,
    username: config.username,
    password: decryptSecret(config.passwordEncrypted),
    readyTimeout: 20_000,
  };

  return new Promise<{ client: Client; sftp: SFTPWrapper }>((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      client.off("error", onError);
      client.off("ready", onReady);
    };
    const onReady = () => {
      client.sftp((error, sftp) => {
        cleanup();
        if (error) {
          client.end();
          reject(error);
        } else {
          resolve({ client, sftp });
        }
      });
    };

    client.once("error", onError);
    client.once("ready", onReady);
    client.connect(connectConfig);
  });
}

function sftpStat(sftp: SFTPWrapper, filePath: string, timeoutMs = DEFAULT_REMOTE_OPERATION_TIMEOUT_MS) {
  return withTimeout(
    new Promise<Stats>((resolve, reject) => {
      sftp.stat(filePath, (error, stats) => {
        if (error) reject(error);
        else resolve(stats);
      });
    }),
    timeoutMs,
    `SFTP stat ${filePath}`,
  );
}

async function sftpDirectoryExists(
  sftp: SFTPWrapper,
  directory: string,
  timeoutMs = DEFAULT_REMOTE_OPERATION_TIMEOUT_MS,
) {
  try {
    const stats = await sftpStat(sftp, directory, timeoutMs);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function sftpReaddir(sftp: SFTPWrapper, directory: string, timeoutMs = DEFAULT_REMOTE_OPERATION_TIMEOUT_MS) {
  return withTimeout(
    new Promise<FileEntryWithStats[]>((resolve, reject) => {
      sftp.readdir(directory, (error, entries) => {
        if (error) reject(error);
        else resolve(entries);
      });
    }),
    timeoutMs,
    `SFTP list ${directory}`,
  );
}

function sftpEntryToRemoteEntry(entry: FileEntryWithStats): RemoteDirectoryEntry {
  return {
    filename: entry.filename,
    attrs: entry.attrs,
  };
}

export async function createSftpStorage(configJson: string | null): Promise<LibraryStorage> {
  const config = parseSftpConfig(configJson);
  const { client, sftp } = await sftpConnect(config);
  const operationTimeoutMs = config.operationTimeoutMs;

  return {
    source: "sftp",
    root: config.root,
    operationTimeoutMs,
    async statFile(filePath) {
      try {
        const info = await sftpStat(sftp, filePath, operationTimeoutMs);
        if (!info.isFile()) return null;
        return fileInfoFromRemotePath(filePath, info);
      } catch {
        return null;
      }
    },
    async listFiles(directory) {
      try {
        const entries = await sftpReaddir(sftp, directory, operationTimeoutMs);
        return entries
          .filter((entry) => entry.attrs.isFile())
          .map((entry) => fileInfoFromRemotePath(path.posix.join(directory, entry.filename), entry.attrs));
      } catch {
        return null;
      }
    },
    walkFiles(root) {
      return walkRemoteFiles(
        root,
        async (directory) => (await sftpReaddir(sftp, directory, operationTimeoutMs)).map(sftpEntryToRemoteEntry),
        config.walkConcurrency,
      );
    },
    async createReadStream(filePath, range, options) {
      const stream = sftp.createReadStream(filePath, range ? { start: range.start, end: range.end } : undefined);
      if (options?.keepOpen) return stream;

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        client.end();
      };
      stream.once("close", close);
      stream.once("error", close);
      return stream;
    },
    async close() {
      client.end();
    },
  };
}

export async function createLibraryStorage(library: StoredLibrary): Promise<LibraryStorage> {
  if (library.source === "sftp") return createSftpStorage(library.config_json);
  if (library.source === "webdav") return createWebdavStorage(library.config_json);
  return createLocalStorage();
}

export async function testSftpConnection(config: SftpLibraryConfig) {
  const { client, sftp } = await sftpConnect(config);
  const operationTimeoutMs = config.operationTimeoutMs;
  try {
    let stats: Stats;
    try {
      stats = await sftpStat(sftp, config.root, operationTimeoutMs);
    } catch (error) {
      const withoutLeadingSlash = config.root.startsWith("/") ? config.root.slice(1) : "";
      if (withoutLeadingSlash && (await sftpDirectoryExists(sftp, withoutLeadingSlash, operationTimeoutMs))) {
        throw new Error(`SFTP root was not found. Try "${withoutLeadingSlash}" without the leading slash.`);
      }
      throw new Error(`SFTP root was not found: ${remoteErrorMessage(error)}`);
    }
    if (!stats.isDirectory()) throw new Error("SFTP root must be a directory.");
  } finally {
    client.end();
  }
}
