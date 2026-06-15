import path from "node:path";

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

export type RemoteDirectoryEntry = {
  filename: string;
  attrs: {
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
    mtime: number;
  };
};

type RemoteDirectoryReadResult = {
  directory: string;
  entries?: RemoteDirectoryEntry[];
  error?: unknown;
};

export const DEFAULT_REMOTE_WALK_CONCURRENCY = 4;
export const DEFAULT_REMOTE_OPERATION_TIMEOUT_MS = 30_000;
export const MIN_REMOTE_WALK_CONCURRENCY = 1;
export const MAX_REMOTE_WALK_CONCURRENCY = 32;
export const MIN_REMOTE_OPERATION_TIMEOUT_MS = 5_000;
export const MAX_REMOTE_OPERATION_TIMEOUT_MS = 300_000;

export const DEFAULT_SFTP_WALK_CONCURRENCY = DEFAULT_REMOTE_WALK_CONCURRENCY;
export const DEFAULT_SFTP_OPERATION_TIMEOUT_MS = DEFAULT_REMOTE_OPERATION_TIMEOUT_MS;
export const MIN_SFTP_WALK_CONCURRENCY = MIN_REMOTE_WALK_CONCURRENCY;
export const MAX_SFTP_WALK_CONCURRENCY = MAX_REMOTE_WALK_CONCURRENCY;
export const MIN_SFTP_OPERATION_TIMEOUT_MS = MIN_REMOTE_OPERATION_TIMEOUT_MS;
export const MAX_SFTP_OPERATION_TIMEOUT_MS = MAX_REMOTE_OPERATION_TIMEOUT_MS;

export function normalizeRemoteWalkConcurrency(value: unknown) {
  const numeric =
    value === null || value === undefined || value === "" ? DEFAULT_REMOTE_WALK_CONCURRENCY : Number(value);
  if (!Number.isInteger(numeric) || numeric < MIN_REMOTE_WALK_CONCURRENCY || numeric > MAX_REMOTE_WALK_CONCURRENCY) {
    throw new Error(
      `Remote walk concurrency must be between ${MIN_REMOTE_WALK_CONCURRENCY} and ${MAX_REMOTE_WALK_CONCURRENCY}.`,
    );
  }
  return numeric;
}

export function normalizeRemoteOperationTimeoutMs(value: unknown) {
  const numeric =
    value === null || value === undefined || value === "" ? DEFAULT_REMOTE_OPERATION_TIMEOUT_MS : Number(value);
  if (
    !Number.isInteger(numeric) ||
    numeric < MIN_REMOTE_OPERATION_TIMEOUT_MS ||
    numeric > MAX_REMOTE_OPERATION_TIMEOUT_MS
  ) {
    throw new Error(
      `Remote operation timeout must be between ${MIN_REMOTE_OPERATION_TIMEOUT_MS}ms and ${MAX_REMOTE_OPERATION_TIMEOUT_MS}ms.`,
    );
  }
  return numeric;
}

export function normalizeSftpWalkConcurrency(value: unknown) {
  return normalizeRemoteWalkConcurrency(value);
}

export function normalizeSftpOperationTimeoutMs(value: unknown) {
  return normalizeRemoteOperationTimeoutMs(value);
}

export function normalizeWebdavWalkConcurrency(value: unknown) {
  return normalizeRemoteWalkConcurrency(value);
}

export function normalizeWebdavOperationTimeoutMs(value: unknown) {
  return normalizeRemoteOperationTimeoutMs(value);
}

export function normalizeRemotePath(value: string) {
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed) return ".";
  const normalized = path.posix.normalize(trimmed);
  return normalized === "/" ? "/" : normalized.replace(/\/+$/, "");
}

export function fileInfoFromRemotePath(filePath: string, stats: { size: number; mtime: number }): StorageFileInfo {
  return {
    path: filePath,
    basename: path.posix.basename(filePath),
    extension: path.posix.extname(filePath).toLowerCase(),
    size: stats.size,
    mtimeMs: Math.round(stats.mtime * 1000),
  };
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export function remoteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readRemoteDirectory(
  directory: string,
  readDirectory: (directory: string) => Promise<RemoteDirectoryEntry[]>,
): Promise<RemoteDirectoryReadResult> {
  try {
    return { directory, entries: await readDirectory(directory) };
  } catch (error) {
    return { directory, error };
  }
}

export async function* walkRemoteFiles(
  root: string,
  readDirectory: (directory: string) => Promise<RemoteDirectoryEntry[]>,
  concurrency = DEFAULT_REMOTE_WALK_CONCURRENCY,
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
      [...inFlight].map(([taskId, task]) => task.then((result) => [taskId, result] as const)),
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
      const fullPath =
        result.directory === "/" ? `/${entry.filename}` : path.posix.join(result.directory, entry.filename);
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
