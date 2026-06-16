import path from "node:path";
import { getDb } from "../db";
import { createId } from "../id";
import { encryptSecret } from "../secrets";
import {
  normalizeRemoteOperationTimeoutMs,
  normalizeRemotePath,
  normalizeRemoteWalkConcurrency,
  parseWebdavConfig,
  testWebdavConnection,
  webdavDisplayPath,
  type WebdavLibraryConfig,
} from "../storage";
import { nowIso } from "../time";
import {
  assertSupportedLibraryKind,
  normalizeScanIntervalMinutes,
  normalizeWatchEnabled,
  remotePathsOverlap,
} from "./shared";
import type { CreateLibraryOptions, CreateWebdavLibraryInput, UpdateWebdavLibraryInput } from "./types";

export function parseWebdavInput(input: CreateWebdavLibraryInput): WebdavLibraryConfig {
  const host = input.host.trim();
  const username = input.username.trim();
  const root = normalizeRemotePath(input.root);
  const secure = input.secure !== false;
  const port = Number(input.port || (secure ? 443 : 80));
  const password = input.password.trim();

  if (!host) throw new Error("WebDAV host is required.");
  if (!username) throw new Error("WebDAV username is required.");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("WebDAV port is invalid.");
  if (!password) throw new Error("WebDAV password is required.");
  if (!root || root === ".") throw new Error("WebDAV root path is required.");

  return {
    host,
    port,
    secure,
    username,
    root,
    passwordEncrypted: encryptSecret(password),
    walkConcurrency: normalizeRemoteWalkConcurrency(input.walkConcurrency),
    operationTimeoutMs: normalizeRemoteOperationTimeoutMs(input.operationTimeoutMs),
  };
}

export function parseWebdavUpdateInput(
  input: UpdateWebdavLibraryInput,
  existingConfig: WebdavLibraryConfig,
): WebdavLibraryConfig {
  const host = input.host.trim();
  const username = input.username.trim();
  const root = normalizeRemotePath(input.root);
  const secure = input.secure !== false;
  const port = Number(input.port || (secure ? 443 : 80));
  const password = input.password?.trim() ?? "";

  if (!host) throw new Error("WebDAV host is required.");
  if (!username) throw new Error("WebDAV username is required.");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("WebDAV port is invalid.");
  if (!root || root === ".") throw new Error("WebDAV root path is required.");

  return {
    host,
    port,
    secure,
    username,
    root,
    passwordEncrypted: password ? encryptSecret(password) : existingConfig.passwordEncrypted,
    walkConcurrency: normalizeRemoteWalkConcurrency(input.walkConcurrency ?? existingConfig.walkConcurrency),
    operationTimeoutMs: normalizeRemoteOperationTimeoutMs(
      input.operationTimeoutMs ?? existingConfig.operationTimeoutMs,
    ),
  };
}

export async function createWebdavLibrary(input: CreateWebdavLibraryInput, options: CreateLibraryOptions = {}) {
  assertSupportedLibraryKind(input.kind);
  const config = parseWebdavInput(input);
  await (options.testWebdavConnection ?? testWebdavConnection)(config);

  const displayPath = webdavDisplayPath(config);
  const cleanName = input.name.trim() || path.posix.basename(config.root) || config.host;
  const db = await getDb();
  const existing = await db.selectFrom("library").select("id").where("path", "=", displayPath).executeTakeFirst();
  if (existing) throw new Error("Library path is already configured.");

  const libraries = await db
    .selectFrom("library")
    .select(["source", "path", "config_json"])
    .where("source", "=", "webdav")
    .execute();
  const overlapping = libraries.find((library) => {
    if (!library.config_json) return false;
    try {
      const existingConfig = JSON.parse(library.config_json) as Pick<
        WebdavLibraryConfig,
        "host" | "port" | "secure" | "username" | "root"
      >;
      return (
        existingConfig.host === config.host &&
        Number(existingConfig.port) === config.port &&
        Boolean(existingConfig.secure) === config.secure &&
        existingConfig.username === config.username &&
        (remotePathsOverlap(existingConfig.root, config.root) || remotePathsOverlap(config.root, existingConfig.root))
      );
    } catch {
      return false;
    }
  });
  if (overlapping) throw new Error("Library path overlaps with an existing library.");

  const now = nowIso();
  const library = {
    id: createId(),
    name: cleanName,
    kind: input.kind,
    source: "webdav" as const,
    access_mode: "all" as const,
    path: displayPath,
    config_json: JSON.stringify(config),
    watch_enabled: normalizeWatchEnabled("webdav", input.watchEnabled),
    scan_interval_minutes: normalizeScanIntervalMinutes(input.scanIntervalMinutes),
    last_scheduled_scan_at: null,
    created_at: now,
    updated_at: now,
  };

  await db.insertInto("library").values(library).execute();
  return library;
}

type UpdateWebdavLibraryParams = {
  id: string;
  input: UpdateWebdavLibraryInput;
  existingConfigJson: string | null;
  watchEnabled: number;
  scanIntervalMinutes: number | null;
  resetScheduledScanAt: Partial<{ last_scheduled_scan_at: null }>;
  options?: CreateLibraryOptions;
};

export async function updateWebdavLibrary({
  id,
  input,
  existingConfigJson,
  watchEnabled,
  scanIntervalMinutes,
  resetScheduledScanAt,
  options = {},
}: UpdateWebdavLibraryParams) {
  const db = await getDb();
  const existingConfig = parseWebdavConfig(existingConfigJson);
  const config = parseWebdavUpdateInput(input, existingConfig);
  await (options.testWebdavConnection ?? testWebdavConnection)(config);

  const displayPath = webdavDisplayPath(config);
  const duplicate = await db
    .selectFrom("library")
    .select("id")
    .where("path", "=", displayPath)
    .where("id", "!=", id)
    .executeTakeFirst();
  if (duplicate) throw new Error("Library path is already configured.");

  const libraries = await db
    .selectFrom("library")
    .select(["id", "source", "path", "config_json"])
    .where("source", "=", "webdav")
    .where("id", "!=", id)
    .execute();
  const overlapping = libraries.find((library) => {
    if (!library.config_json) return false;
    try {
      const otherConfig = parseWebdavConfig(library.config_json);
      return (
        otherConfig.host === config.host &&
        Number(otherConfig.port) === config.port &&
        otherConfig.secure === config.secure &&
        otherConfig.username === config.username &&
        (remotePathsOverlap(otherConfig.root, config.root) || remotePathsOverlap(config.root, otherConfig.root))
      );
    } catch {
      return false;
    }
  });
  if (overlapping) throw new Error("Library path overlaps with an existing library.");

  const cleanName = input.name.trim() || path.posix.basename(config.root) || config.host;
  const now = nowIso();
  await db
    .updateTable("library")
    .set({
      name: cleanName,
      path: displayPath,
      config_json: JSON.stringify(config),
      watch_enabled: watchEnabled,
      scan_interval_minutes: scanIntervalMinutes,
      ...resetScheduledScanAt,
      updated_at: now,
    })
    .where("id", "=", id)
    .execute();
}
