import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Client, type ConnectConfig, type FileEntryWithStats, type SFTPWrapper, type Stats } from "ssh2";
import type { LibrarySource } from "../db/schema";
import { decryptSecret } from "../secrets";

export type StorageFileInfo = {
  path: string;
  basename: string;
  extension: string;
  size: number;
  mtimeMs: number;
};

export type StorageWalkEntry =
  | { kind: "directory"; path: string; files: StorageFileInfo[] }
  | { kind: "file"; path: string; file?: StorageFileInfo }
  | { kind: "error"; path: string; error: unknown };

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

type RemoteDirectoryReadResult = {
  directory: string;
  entries?: FileEntryWithStats[];
  error?: unknown;
};

export const DEFAULT_SFTP_WALK_CONCURRENCY = 4;
export const DEFAULT_SFTP_OPERATION_TIMEOUT_MS = 30_000;
export const MIN_SFTP_WALK_CONCURRENCY = 1;
export const MAX_SFTP_WALK_CONCURRENCY = 32;
export const MIN_SFTP_OPERATION_TIMEOUT_MS = 5_000;
export const MAX_SFTP_OPERATION_TIMEOUT_MS = 300_000;

export function normalizeSftpWalkConcurrency(value: unknown) {
  const numeric =
    value === null || value === undefined || value === ""
      ? DEFAULT_SFTP_WALK_CONCURRENCY
      : Number(value);
  if (
    !Number.isInteger(numeric) ||
    numeric < MIN_SFTP_WALK_CONCURRENCY ||
    numeric > MAX_SFTP_WALK_CONCURRENCY
  ) {
    throw new Error(
      `SFTP walk concurrency must be between ${MIN_SFTP_WALK_CONCURRENCY} and ${MAX_SFTP_WALK_CONCURRENCY}.`
    );
  }
  return numeric;
}

export function normalizeSftpOperationTimeoutMs(value: unknown) {
  const numeric =
    value === null || value === undefined || value === ""
      ? DEFAULT_SFTP_OPERATION_TIMEOUT_MS
      : Number(value);
  if (
    !Number.isInteger(numeric) ||
    numeric < MIN_SFTP_OPERATION_TIMEOUT_MS ||
    numeric > MAX_SFTP_OPERATION_TIMEOUT_MS
  ) {
    throw new Error(
      `SFTP operation timeout must be between ${MIN_SFTP_OPERATION_TIMEOUT_MS}ms and ${MAX_SFTP_OPERATION_TIMEOUT_MS}ms.`
    );
  }
  return numeric;
}

function fileInfoFromLocalPath(filePath: string, info: { size: number; mtimeMs: number }): StorageFileInfo {
  return {
    path: filePath,
    basename: path.basename(filePath),
    extension: path.extname(filePath).toLowerCase(),
    size: info.size,
    mtimeMs: Math.round(info.mtimeMs)
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
    }
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
    walkConcurrency: normalizeSftpWalkConcurrency(parsed.walkConcurrency),
    operationTimeoutMs: normalizeSftpOperationTimeoutMs(parsed.operationTimeoutMs)
  };
}

export function sftpOperationTimeoutMsFromConfig(configJson: string | null) {
  try {
    return parseSftpConfig(configJson).operationTimeoutMs;
  } catch {
    return DEFAULT_SFTP_OPERATION_TIMEOUT_MS;
  }
}

export function normalizeRemotePath(value: string) {
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed) return ".";
  const normalized = path.posix.normalize(trimmed);
  return normalized === "/" ? "/" : normalized.replace(/\/+$/, "");
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
    readyTimeout: 20_000
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function sftpStat(sftp: SFTPWrapper, filePath: string, timeoutMs = DEFAULT_SFTP_OPERATION_TIMEOUT_MS) {
  return withTimeout(
    new Promise<Stats>((resolve, reject) => {
      sftp.stat(filePath, (error, stats) => {
        if (error) reject(error);
        else resolve(stats);
      });
    }),
    timeoutMs,
    `SFTP stat ${filePath}`
  );
}

function sftpErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function sftpDirectoryExists(sftp: SFTPWrapper, directory: string, timeoutMs = DEFAULT_SFTP_OPERATION_TIMEOUT_MS) {
  try {
    const stats = await sftpStat(sftp, directory, timeoutMs);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function sftpReaddir(sftp: SFTPWrapper, directory: string, timeoutMs = DEFAULT_SFTP_OPERATION_TIMEOUT_MS) {
  return withTimeout(
    new Promise<FileEntryWithStats[]>((resolve, reject) => {
      sftp.readdir(directory, (error, entries) => {
        if (error) reject(error);
        else resolve(entries);
      });
    }),
    timeoutMs,
    `SFTP list ${directory}`
  );
}

function fileInfoFromRemotePath(filePath: string, stats: { size: number; mtime: number }): StorageFileInfo {
  return {
    path: filePath,
    basename: path.posix.basename(filePath),
    extension: path.posix.extname(filePath).toLowerCase(),
    size: stats.size,
    mtimeMs: Math.round(stats.mtime * 1000)
  };
}

async function readRemoteDirectory(
  directory: string,
  readDirectory: (directory: string) => Promise<FileEntryWithStats[]>
): Promise<RemoteDirectoryReadResult> {
  try {
    return { directory, entries: await readDirectory(directory) };
  } catch (error) {
    return { directory, error };
  }
}

export async function* walkSftpFiles(
  root: string,
  readDirectory: (directory: string) => Promise<FileEntryWithStats[]>,
  concurrency = DEFAULT_SFTP_WALK_CONCURRENCY
): AsyncGenerator<StorageWalkEntry> {
  const directoryConcurrency = Math.max(1, Math.floor(concurrency));
  const pendingDirectories = [root];
  const inFlight = new Map<number, Promise<RemoteDirectoryReadResult>>();
  let nextTaskId = 0;

  function enqueue(directory: string) {
    inFlight.set(nextTaskId, readRemoteDirectory(directory, readDirectory));
    nextTaskId += 1;
  }

  function fillQueue() {
    while (pendingDirectories.length > 0 && inFlight.size < directoryConcurrency) {
      enqueue(pendingDirectories.shift() as string);
    }
  }

  fillQueue();
  while (inFlight.size > 0) {
    const [taskId, result] = await Promise.race(
      [...inFlight].map(([taskId, task]) => task.then((result) => [taskId, result] as const))
    );
    inFlight.delete(taskId);

    if (result.error) {
      yield { kind: "error", path: result.directory, error: result.error };
      fillQueue();
      continue;
    }

    const directories: string[] = [];
    const files: StorageFileInfo[] = [];
    for (const entry of (result.entries ?? []).sort((left, right) => left.filename.localeCompare(right.filename))) {
      if (entry.filename === "." || entry.filename === "..") continue;
      const fullPath = result.directory === "/" ? `/${entry.filename}` : path.posix.join(result.directory, entry.filename);
      if (entry.attrs.isDirectory()) {
        directories.push(fullPath);
      } else if (entry.attrs.isFile()) {
        files.push(fileInfoFromRemotePath(fullPath, entry.attrs));
      }
    }

    yield { kind: "directory", path: result.directory, files };
    for (const file of files) {
      yield { kind: "file", path: file.path, file };
    }
    pendingDirectories.push(...directories);
    fillQueue();
  }
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
      return walkSftpFiles(
        root,
        (directory) => sftpReaddir(sftp, directory, operationTimeoutMs),
        config.walkConcurrency
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
    }
  };
}

export async function createLibraryStorage(library: StoredLibrary): Promise<LibraryStorage> {
  if (library.source === "sftp") return createSftpStorage(library.config_json);
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
      if (withoutLeadingSlash && await sftpDirectoryExists(sftp, withoutLeadingSlash, operationTimeoutMs)) {
        throw new Error(`SFTP root was not found. Try "${withoutLeadingSlash}" without the leading slash.`);
      }
      throw new Error(`SFTP root was not found: ${sftpErrorMessage(error)}`);
    }
    if (!stats.isDirectory()) throw new Error("SFTP root must be a directory.");
  } finally {
    client.end();
  }
}
