import path from "node:path";
import { Readable } from "node:stream";
import { createClient, type FileStat, type WebDAVClient } from "webdav";
import { decryptSecret } from "../secrets";
import {
  DEFAULT_REMOTE_OPERATION_TIMEOUT_MS,
  fileInfoFromRemotePath,
  normalizeRemoteOperationTimeoutMs,
  normalizeRemotePath,
  normalizeRemoteWalkConcurrency,
  remoteErrorMessage,
  walkRemoteFiles,
  withTimeout,
  type RemoteDirectoryEntry,
} from "./remote";

export type WebdavLibraryConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  root: string;
  passwordEncrypted: string;
  walkConcurrency: number;
  operationTimeoutMs: number;
};

function webdavClientUrl(config: WebdavLibraryConfig) {
  const scheme = config.secure ? "https" : "http";
  const hostPart = config.host.replace(/^\/+|\/+$/g, "");
  const defaultPort = config.secure ? 443 : 80;
  const portPart = config.port === defaultPort ? "" : `:${config.port}`;
  return `${scheme}://${hostPart}${portPart}/`;
}

function webdavPath(filePath: string) {
  const normalized = normalizeRemotePath(filePath);
  return normalized === "." ? "/" : normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function fileStatToRemoteEntry(entry: FileStat): RemoteDirectoryEntry {
  const mtimeMs = Date.parse(entry.lastmod);
  return {
    filename: entry.basename,
    attrs: {
      isDirectory: () => entry.type === "directory",
      isFile: () => entry.type === "file",
      size: entry.size,
      mtime: Number.isFinite(mtimeMs) ? mtimeMs / 1000 : 0,
    },
  };
}

function normalizeFileStat(result: FileStat | { data: FileStat }): FileStat {
  return "data" in result ? result.data : result;
}

function webdavConnect(config: WebdavLibraryConfig): WebDAVClient {
  return createClient(webdavClientUrl(config), {
    username: config.username,
    password: decryptSecret(config.passwordEncrypted),
  });
}

async function webdavStat(client: WebDAVClient, filePath: string, timeoutMs: number, options?: { raw?: boolean }) {
  const target = options?.raw ? filePath : webdavPath(filePath);
  const controller = new AbortController();
  try {
    const result = await withTimeout(
      client.stat(target, { signal: controller.signal }),
      timeoutMs,
      `WebDAV stat ${filePath}`,
      {
        onTimeout: () => controller.abort(),
      },
    );
    return normalizeFileStat(result);
  } finally {
    controller.abort();
  }
}

async function webdavDirectoryExists(
  client: WebDAVClient,
  directory: string,
  timeoutMs: number,
  options?: { raw?: boolean },
) {
  try {
    const stats = await webdavStat(client, directory, timeoutMs, options);
    return stats.type === "directory";
  } catch {
    return false;
  }
}

async function webdavReaddir(client: WebDAVClient, directory: string, timeoutMs: number) {
  const controller = new AbortController();
  try {
    const entries = await withTimeout(
      client.getDirectoryContents(webdavPath(directory), { signal: controller.signal }),
      timeoutMs,
      `WebDAV list ${directory}`,
      {
        onTimeout: () => controller.abort(),
      },
    );
    return entries.map(fileStatToRemoteEntry);
  } finally {
    controller.abort();
  }
}

export function parseWebdavConfig(configJson: string | null): WebdavLibraryConfig {
  if (!configJson) throw new Error("WebDAV library is missing connection config.");
  const parsed = JSON.parse(configJson) as Partial<WebdavLibraryConfig & { secure?: boolean }>;
  if (!parsed.host || !parsed.username || !parsed.root || !parsed.passwordEncrypted) {
    throw new Error("WebDAV library config is incomplete.");
  }
  const secure = parsed.secure !== false;

  return {
    host: parsed.host,
    port: Number(parsed.port || (secure ? 443 : 80)),
    secure,
    username: parsed.username,
    root: normalizeRemotePath(parsed.root),
    passwordEncrypted: parsed.passwordEncrypted,
    walkConcurrency: normalizeRemoteWalkConcurrency(parsed.walkConcurrency),
    operationTimeoutMs: normalizeRemoteOperationTimeoutMs(parsed.operationTimeoutMs),
  };
}

export function webdavOperationTimeoutMsFromConfig(configJson: string | null) {
  try {
    return parseWebdavConfig(configJson).operationTimeoutMs;
  } catch {
    return DEFAULT_REMOTE_OPERATION_TIMEOUT_MS;
  }
}

export function webdavDisplayPath(input: {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  root: string;
}) {
  const scheme = input.secure ? "webdavs" : "webdav";
  const defaultPort = input.secure ? 443 : 80;
  const portPart = input.port === defaultPort ? "" : `:${input.port}`;
  const root = input.root.startsWith("/") ? input.root : `/${input.root}`;
  return `${scheme}://${input.username}@${input.host}${portPart}${root}`;
}

export async function createWebdavStorage(configJson: string | null) {
  const config = parseWebdavConfig(configJson);
  const client = webdavConnect(config);
  const operationTimeoutMs = config.operationTimeoutMs;
  const activeStreams = new Set<Readable>();

  return {
    source: "webdav" as const,
    root: config.root,
    operationTimeoutMs,
    async statFile(filePath: string) {
      try {
        const info = await webdavStat(client, filePath, operationTimeoutMs);
        if (info.type !== "file") return null;
        const mtimeMs = Date.parse(info.lastmod);
        return fileInfoFromRemotePath(webdavPath(filePath), {
          size: info.size,
          mtime: Number.isFinite(mtimeMs) ? mtimeMs / 1000 : 0,
        });
      } catch {
        return null;
      }
    },
    async listFiles(directory: string) {
      try {
        const entries = await webdavReaddir(client, directory, operationTimeoutMs);
        const basePath = webdavPath(directory);
        return entries
          .filter((entry) => entry.attrs.isFile())
          .map((entry) =>
            fileInfoFromRemotePath(
              basePath === "/" ? `/${entry.filename}` : path.posix.join(basePath, entry.filename),
              entry.attrs,
            ),
          );
      } catch {
        return null;
      }
    },
    walkFiles(root: string) {
      return walkRemoteFiles(
        root,
        (directory) => webdavReaddir(client, directory, operationTimeoutMs),
        config.walkConcurrency,
      );
    },
    async createReadStream(filePath: string, range?: { start: number; end: number }, options?: { keepOpen?: boolean }) {
      const stream = client.createReadStream(webdavPath(filePath), {
        range: range ? { start: range.start, end: range.end } : undefined,
      }) as Readable;
      if (options?.keepOpen) return stream;

      activeStreams.add(stream);
      const release = () => {
        activeStreams.delete(stream);
      };
      stream.once("close", release);
      stream.once("error", release);
      return stream;
    },
    async close() {
      for (const stream of activeStreams) {
        if (!stream.destroyed) stream.destroy();
      }
      activeStreams.clear();
    },
  };
}

export async function testWebdavConnection(config: WebdavLibraryConfig) {
  const client = webdavConnect(config);
  const operationTimeoutMs = config.operationTimeoutMs;
  let stats: FileStat;
  try {
    stats = await webdavStat(client, config.root, operationTimeoutMs);
  } catch (error) {
    const withoutLeadingSlash = config.root.startsWith("/") ? config.root.slice(1) : "";
    if (
      withoutLeadingSlash &&
      (await webdavDirectoryExists(client, withoutLeadingSlash, operationTimeoutMs, { raw: true }))
    ) {
      throw new Error(`WebDAV root was not found. Try "${withoutLeadingSlash}" without the leading slash.`);
    }
    throw new Error(`WebDAV root was not found: ${remoteErrorMessage(error)}`);
  }
  if (stats.type !== "directory") throw new Error("WebDAV root must be a directory.");
}
