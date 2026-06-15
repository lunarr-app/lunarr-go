import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { getDb } from "../db";
import type { LibraryAccessMode, LibraryKind, LibrarySource } from "../db/schema";
import { createId } from "../id";
import { encryptSecret } from "../secrets";
import {
  normalizeRemoteOperationTimeoutMs,
  normalizeRemotePath,
  normalizeRemoteWalkConcurrency,
  parseSftpConfig,
  parseWebdavConfig,
  sftpDisplayPath,
  testSftpConnection,
  testWebdavConnection,
  webdavDisplayPath,
  type SftpLibraryConfig,
  type WebdavLibraryConfig,
} from "../storage";
import { nowIso } from "../time";

export async function listLibraries() {
  const db = await getDb();
  return db.selectFrom("library").selectAll().orderBy("created_at", "asc").execute();
}

export async function listLibrariesWithScanStatus() {
  const libraries = await listLibraries();
  if (libraries.length === 0) return [];

  const db = await getDb();
  const shares = await db
    .selectFrom("library_user")
    .select(["library_id", "user_id"])
    .where(
      "library_id",
      "in",
      libraries.map((library) => library.id),
    )
    .execute();
  const sharedUsersByLibrary = new Map<string, string[]>();
  for (const share of shares) {
    const users = sharedUsersByLibrary.get(share.library_id) ?? [];
    users.push(share.user_id);
    sharedUsersByLibrary.set(share.library_id, users);
  }
  const jobs = await db
    .selectFrom("scan_job")
    .select([
      "id",
      "library_id",
      "status",
      "started_at",
      "finished_at",
      "files_seen",
      "files_added",
      "files_updated",
      "files_removed",
      "errors_count",
      "created_at",
    ])
    .where(
      "library_id",
      "in",
      libraries.map((library) => library.id),
    )
    .orderBy("created_at", "desc")
    .execute();

  const latestJobByLibrary = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) {
    if (job.library_id && !latestJobByLibrary.has(job.library_id)) {
      latestJobByLibrary.set(job.library_id, job);
    }
  }

  return libraries.map((library) => {
    const latestScanJob = latestJobByLibrary.get(library.id) ?? null;
    let sftpConfig: Pick<
      SftpLibraryConfig,
      "host" | "port" | "username" | "root" | "walkConcurrency" | "operationTimeoutMs"
    > | null = null;
    let webdavConfig: Pick<
      WebdavLibraryConfig,
      "host" | "port" | "secure" | "username" | "root" | "walkConcurrency" | "operationTimeoutMs"
    > | null = null;
    if (library.source === "sftp") {
      try {
        const config = parseSftpConfig(library.config_json);
        sftpConfig = {
          host: config.host,
          port: config.port,
          username: config.username,
          root: config.root,
          walkConcurrency: config.walkConcurrency,
          operationTimeoutMs: config.operationTimeoutMs,
        };
      } catch {
        sftpConfig = null;
      }
    }
    if (library.source === "webdav") {
      try {
        const config = parseWebdavConfig(library.config_json);
        webdavConfig = {
          host: config.host,
          port: config.port,
          secure: config.secure,
          username: config.username,
          root: config.root,
          walkConcurrency: config.walkConcurrency,
          operationTimeoutMs: config.operationTimeoutMs,
        };
      } catch {
        webdavConfig = null;
      }
    }
    return {
      ...library,
      sftpConfig,
      webdavConfig,
      sharedUserIds: sharedUsersByLibrary.get(library.id) ?? [],
      latestScanJob,
      scanActive: latestScanJob?.status === "queued" || latestScanJob?.status === "running",
    };
  });
}

export async function listLibraryShareUsers() {
  const db = await getDb();
  return db
    .selectFrom("user")
    .select(["id", "name", "email", "role"])
    .where("role", "!=", "admin")
    .orderBy("name", "asc")
    .orderBy("email", "asc")
    .execute();
}

function normalizeAccessMode(value: string | null | undefined): LibraryAccessMode {
  return value === "shared" ? "shared" : "all";
}

export async function updateLibraryAccess(libraryId: string, accessModeInput: string, userIds: string[]) {
  const db = await getDb();
  const library = await db.selectFrom("library").select("id").where("id", "=", libraryId).executeTakeFirst();
  if (!library) throw new Error("Library not found.");

  const accessMode = normalizeAccessMode(accessModeInput);
  const cleanUserIds = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  const now = nowIso();
  const allowedUsers =
    cleanUserIds.length === 0
      ? []
      : await db.selectFrom("user").select("id").where("id", "in", cleanUserIds).where("role", "!=", "admin").execute();
  const allowedUserIds = new Set(allowedUsers.map((user) => user.id));

  await db
    .updateTable("library")
    .set({ access_mode: accessMode, updated_at: now })
    .where("id", "=", libraryId)
    .execute();
  await db.deleteFrom("library_user").where("library_id", "=", libraryId).execute();
  if (accessMode === "shared" && allowedUserIds.size > 0) {
    await db
      .insertInto("library_user")
      .values(
        [...allowedUserIds].map((userId) => ({
          library_id: libraryId,
          user_id: userId,
          created_at: now,
        })),
      )
      .execute();
  }
}

export async function getLibrary(id: string) {
  const db = await getDb();
  return db.selectFrom("library").selectAll().where("id", "=", id).executeTakeFirst();
}

function pathsOverlap(left: string, right: string) {
  const relative = path.relative(left, right);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function remotePathsOverlap(left: string, right: string) {
  const relative = path.posix.relative(left, right);
  return relative === "" || (!relative.startsWith("..") && !path.posix.isAbsolute(relative));
}

type CreateLocalLibraryInput = {
  source?: "local";
  name: string;
  kind: LibraryKind;
  path: string;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

type CreateSftpLibraryInput = {
  source: "sftp";
  name: string;
  kind: LibraryKind;
  host: string;
  port: number;
  username: string;
  password: string;
  root: string;
  walkConcurrency?: number;
  operationTimeoutMs?: number;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

type UpdateLocalLibraryInput = {
  source?: "local";
  name: string;
  path: string;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

type UpdateSftpLibraryInput = {
  source: "sftp";
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  root: string;
  walkConcurrency?: number;
  operationTimeoutMs?: number;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

type CreateWebdavLibraryInput = {
  source: "webdav";
  name: string;
  kind: LibraryKind;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  root: string;
  walkConcurrency?: number;
  operationTimeoutMs?: number;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

type UpdateWebdavLibraryInput = {
  source: "webdav";
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string;
  root: string;
  walkConcurrency?: number;
  operationTimeoutMs?: number;
  watchEnabled?: boolean;
  scanIntervalMinutes?: number | null;
};

export type CreateLibraryInput = CreateLocalLibraryInput | CreateSftpLibraryInput | CreateWebdavLibraryInput;
export type UpdateLibraryInput = UpdateLocalLibraryInput | UpdateSftpLibraryInput | UpdateWebdavLibraryInput;
export type CreateLibraryOptions = {
  testSftpConnection?: typeof testSftpConnection;
  testWebdavConnection?: typeof testWebdavConnection;
};

const MIN_SCAN_INTERVAL_MINUTES = 5;
const MAX_SCAN_INTERVAL_MINUTES = 43_200;

function assertSupportedLibraryKind(kind: LibraryKind) {
  if (kind !== "movie" && kind !== "tv") throw new Error("Unsupported library kind.");
}

function normalizeWatchEnabled(source: LibrarySource, value: boolean | undefined) {
  if (source !== "local") return 0;
  return value === false ? 0 : 1;
}

function normalizeScanIntervalMinutes(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return null;
  if (!Number.isInteger(value) || value < MIN_SCAN_INTERVAL_MINUTES || value > MAX_SCAN_INTERVAL_MINUTES) {
    throw new Error(`Scheduled scan interval must be between ${MIN_SCAN_INTERVAL_MINUTES} minutes and 30 days.`);
  }
  return value;
}

async function createLocalLibrary(input: CreateLocalLibraryInput) {
  const cleanPath = input.path.trim();
  const cleanName = input.name.trim() || path.basename(cleanPath);
  if (!cleanPath) throw new Error("Library path is required.");
  assertSupportedLibraryKind(input.kind);

  let resolved: string;
  try {
    resolved = await realpath(cleanPath);
  } catch {
    throw new Error("Library path does not exist.");
  }

  const info = await stat(resolved);
  if (!info.isDirectory()) throw new Error("Library path must be a directory.");
  try {
    await access(resolved, constants.R_OK);
  } catch {
    throw new Error("Library path is not readable.");
  }

  const db = await getDb();
  const existing = await db.selectFrom("library").select("id").where("path", "=", resolved).executeTakeFirst();
  if (existing) throw new Error("Library path is already configured.");

  const libraries = await db.selectFrom("library").select(["path"]).execute();
  const overlapping = libraries.find(
    (library) => pathsOverlap(library.path, resolved) || pathsOverlap(resolved, library.path),
  );
  if (overlapping) throw new Error("Library path overlaps with an existing library.");

  const now = nowIso();
  const library = {
    id: createId(),
    name: cleanName,
    kind: input.kind,
    source: "local" as const,
    access_mode: "all" as const,
    path: resolved,
    config_json: null,
    watch_enabled: normalizeWatchEnabled("local", input.watchEnabled),
    scan_interval_minutes: normalizeScanIntervalMinutes(input.scanIntervalMinutes),
    last_scheduled_scan_at: null,
    created_at: now,
    updated_at: now,
  };

  await db.insertInto("library").values(library).execute();
  return library;
}

function parseSftpInput(input: CreateSftpLibraryInput): SftpLibraryConfig {
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

function parseWebdavInput(input: CreateWebdavLibraryInput): WebdavLibraryConfig {
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

function parseWebdavUpdateInput(
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

function parseSftpUpdateInput(input: UpdateSftpLibraryInput, existingConfig: SftpLibraryConfig): SftpLibraryConfig {
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

async function activeScanExists(libraryId: string) {
  const db = await getDb();
  const activeScan = await db
    .selectFrom("scan_job")
    .select("id")
    .where("library_id", "=", libraryId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();
  return Boolean(activeScan);
}

async function createSftpLibrary(input: CreateSftpLibraryInput, options: CreateLibraryOptions = {}) {
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

async function createWebdavLibrary(input: CreateWebdavLibraryInput, options: CreateLibraryOptions = {}) {
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

export async function createLibrary(input: CreateLibraryInput, options: CreateLibraryOptions = {}) {
  if (input.source === "sftp") return createSftpLibrary(input, options);
  if (input.source === "webdav") return createWebdavLibrary(input, options);
  return createLocalLibrary(input);
}

export async function updateLibrary(id: string, input: UpdateLibraryInput, options: CreateLibraryOptions = {}) {
  const db = await getDb();
  const existingLibrary = await db.selectFrom("library").selectAll().where("id", "=", id).executeTakeFirst();
  if (!existingLibrary) throw new Error("Library not found.");
  if (await activeScanExists(id)) throw new Error("Library has an active scan.");
  const inputSource = input.source ?? "local";
  if (inputSource !== existingLibrary.source)
    throw new Error("Library source cannot be changed. Add a new library instead.");
  const watchEnabled = normalizeWatchEnabled(existingLibrary.source, input.watchEnabled);
  const scanIntervalMinutes = normalizeScanIntervalMinutes(input.scanIntervalMinutes);
  const resetScheduledScanAt =
    scanIntervalMinutes !== existingLibrary.scan_interval_minutes ? { last_scheduled_scan_at: null } : {};

  const now = nowIso();
  if (existingLibrary.source === "sftp" && input.source === "sftp") {
    const existingConfig = parseSftpConfig(existingLibrary.config_json);
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
    return getLibrary(id);
  }

  if (existingLibrary.source === "webdav" && input.source === "webdav") {
    const existingConfig = parseWebdavConfig(existingLibrary.config_json);
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
    return getLibrary(id);
  }

  const localInput = input as UpdateLocalLibraryInput;
  const cleanPath = localInput.path.trim();
  const cleanName = localInput.name.trim() || path.basename(cleanPath);
  if (!cleanPath) throw new Error("Library path is required.");

  let resolved: string;
  try {
    resolved = await realpath(cleanPath);
  } catch {
    throw new Error("Library path does not exist.");
  }

  const info = await stat(resolved);
  if (!info.isDirectory()) throw new Error("Library path must be a directory.");
  try {
    await access(resolved, constants.R_OK);
  } catch {
    throw new Error("Library path is not readable.");
  }

  const duplicate = await db
    .selectFrom("library")
    .select("id")
    .where("path", "=", resolved)
    .where("id", "!=", id)
    .executeTakeFirst();
  if (duplicate) throw new Error("Library path is already configured.");

  const libraries = await db.selectFrom("library").select(["id", "path"]).where("id", "!=", id).execute();
  const overlapping = libraries.find(
    (library) => pathsOverlap(library.path, resolved) || pathsOverlap(resolved, library.path),
  );
  if (overlapping) throw new Error("Library path overlaps with an existing library.");

  await db
    .updateTable("library")
    .set({
      name: cleanName,
      path: resolved,
      config_json: null,
      watch_enabled: watchEnabled,
      scan_interval_minutes: scanIntervalMinutes,
      ...resetScheduledScanAt,
      updated_at: now,
    })
    .where("id", "=", id)
    .execute();
  return getLibrary(id);
}

export async function deleteLibrary(id: string) {
  const db = await getDb();
  const library = await db.selectFrom("library").select("id").where("id", "=", id).executeTakeFirst();
  if (!library) throw new Error("Library not found.");

  if (await activeScanExists(id)) throw new Error("Library has an active scan.");

  const affectedMediaItems = await db
    .selectFrom("media_file")
    .select("media_item_id")
    .where("library_id", "=", id)
    .execute();
  const affectedMediaItemIds = [...new Set(affectedMediaItems.map((item) => item.media_item_id))];

  await db.deleteFrom("library").where("id", "=", id).execute();

  if (affectedMediaItemIds.length > 0) {
    await db
      .deleteFrom("media_item")
      .where("id", "in", affectedMediaItemIds)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom("media_file")
              .select("media_file.id")
              .whereRef("media_file.media_item_id", "=", "media_item.id"),
          ),
        ),
      )
      .execute();

    await db
      .deleteFrom("media_item")
      .where("kind", "=", "season")
      .where((eb) =>
        eb.not(
          eb.exists(
            eb.selectFrom("media_item as child").select("child.id").whereRef("child.parent_id", "=", "media_item.id"),
          ),
        ),
      )
      .execute();

    await db
      .deleteFrom("media_item")
      .where("kind", "=", "show")
      .where((eb) =>
        eb.not(
          eb.exists(
            eb.selectFrom("media_item as child").select("child.id").whereRef("child.parent_id", "=", "media_item.id"),
          ),
        ),
      )
      .execute();
  }
}
