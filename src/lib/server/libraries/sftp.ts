import path from "node:path";
import { getDb } from "../db";
import { createId } from "../id";
import { encryptSecret } from "../secrets";
import {
  normalizeRemoteOperationTimeoutMs,
  normalizeRemotePath,
  normalizeRemoteWalkConcurrency,
  parseSftpConfig,
  sftpDisplayPath,
  testSftpConnection,
  type SftpLibraryConfig,
} from "../storage";
import { nowIso } from "../time";
import {
  assertSupportedLibraryKind,
  normalizeScanIntervalMinutes,
  normalizeWatchEnabled,
  remotePathsOverlap,
} from "./shared";
import type { CreateLibraryOptions, CreateSftpLibraryInput, UpdateSftpLibraryInput } from "./types";

export function parseSftpInput(input: CreateSftpLibraryInput): SftpLibraryConfig {
  const host = input.host.trim();
  const username = input.username.trim();
  const root = normalizeRemotePath(input.root);
  const port = Number(input.port || 22);
  const password = input.password.trim();

  if (!host) throw new Error("SFTP host is required.");
  if (!username) throw new Error("SFTP username is required.");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("SFTP port is invalid.");
  if (!password) throw new Error("SFTP password is required.");
  if (!root || root === ".") throw new Error("SFTP root path is required.");

  return {
    host,
    port,
    username,
    root,
    passwordEncrypted: encryptSecret(password),
    walkConcurrency: normalizeRemoteWalkConcurrency(input.walkConcurrency),
    operationTimeoutMs: normalizeRemoteOperationTimeoutMs(input.operationTimeoutMs),
  };
}

export function parseSftpUpdateInput(
  input: UpdateSftpLibraryInput,
  existingConfig: SftpLibraryConfig,
): SftpLibraryConfig {
  const host = input.host.trim();
  const username = input.username.trim();
  const root = normalizeRemotePath(input.root);
  const port = Number(input.port || 22);
  const password = input.password?.trim() ?? "";

  if (!host) throw new Error("SFTP host is required.");
  if (!username) throw new Error("SFTP username is required.");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("SFTP port is invalid.");
  if (!root || root === ".") throw new Error("SFTP root path is required.");

  return {
    host,
    port,
    username,
    root,
    passwordEncrypted: password ? encryptSecret(password) : existingConfig.passwordEncrypted,
    walkConcurrency: normalizeRemoteWalkConcurrency(input.walkConcurrency ?? existingConfig.walkConcurrency),
    operationTimeoutMs: normalizeRemoteOperationTimeoutMs(
      input.operationTimeoutMs ?? existingConfig.operationTimeoutMs,
    ),
  };
}

export async function createSftpLibrary(input: CreateSftpLibraryInput, options: CreateLibraryOptions = {}) {
  assertSupportedLibraryKind(input.kind);
  const config = parseSftpInput(input);
  await (options.testSftpConnection ?? testSftpConnection)(config);

  const displayPath = sftpDisplayPath(config);
  const cleanName = input.name.trim() || path.posix.basename(config.root) || config.host;
  const db = await getDb();
  const existing = await db.selectFrom("library").select("id").where("path", "=", displayPath).executeTakeFirst();
  if (existing) throw new Error("Library path is already configured.");

  const libraries = await db
    .selectFrom("library")
    .select(["source", "path", "config_json"])
    .where("source", "=", "sftp")
    .execute();
  const overlapping = libraries.find((library) => {
    if (!library.config_json) return false;
    try {
      const existingConfig = JSON.parse(library.config_json) as Pick<
        SftpLibraryConfig,
        "host" | "port" | "username" | "root"
      >;
      return (
        existingConfig.host === config.host &&
        Number(existingConfig.port) === config.port &&
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
    source: "sftp" as const,
    access_mode: "all" as const,
    path: displayPath,
    config_json: JSON.stringify(config),
    watch_enabled: normalizeWatchEnabled("sftp", input.watchEnabled),
    scan_interval_minutes: normalizeScanIntervalMinutes(input.scanIntervalMinutes),
    last_scheduled_scan_at: null,
    created_at: now,
    updated_at: now,
  };

  await db.insertInto("library").values(library).execute();
  return library;
}

type UpdateSftpLibraryParams = {
  id: string;
  input: UpdateSftpLibraryInput;
  existingConfigJson: string | null;
  watchEnabled: number;
  scanIntervalMinutes: number | null;
  resetScheduledScanAt: Partial<{ last_scheduled_scan_at: null }>;
  options?: CreateLibraryOptions;
};

export async function updateSftpLibrary({
  id,
  input,
  existingConfigJson,
  watchEnabled,
  scanIntervalMinutes,
  resetScheduledScanAt,
  options = {},
}: UpdateSftpLibraryParams) {
  const db = await getDb();
  const existingConfig = parseSftpConfig(existingConfigJson);
  const config = parseSftpUpdateInput(input, existingConfig);
  await (options.testSftpConnection ?? testSftpConnection)(config);

  const displayPath = sftpDisplayPath(config);
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
    .where("source", "=", "sftp")
    .where("id", "!=", id)
    .execute();
  const overlapping = libraries.find((library) => {
    if (!library.config_json) return false;
    try {
      const otherConfig = parseSftpConfig(library.config_json);
      return (
        otherConfig.host === config.host &&
        Number(otherConfig.port) === config.port &&
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
