import { getDb } from "../db";
import type { LibraryAccessMode } from "../db/schema";
import { parseSftpConfig, parseWebdavConfig, type SftpLibraryConfig, type WebdavLibraryConfig } from "../storage";
import { nowIso } from "../time";
import { createLocalLibrary, updateLocalLibrary } from "./local";
import { createSftpLibrary, updateSftpLibrary } from "./sftp";
import { activeScanExists, normalizeScanIntervalMinutes, normalizeWatchEnabled } from "./shared";
import type { CreateLibraryInput, CreateLibraryOptions, UpdateLibraryInput, UpdateLocalLibraryInput } from "./types";
import { createWebdavLibrary, updateWebdavLibrary } from "./webdav";

export type { CreateLibraryInput, CreateLibraryOptions, UpdateLibraryInput } from "./types";

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

  if (existingLibrary.source === "sftp" && input.source === "sftp") {
    await updateSftpLibrary({
      id,
      input,
      existingConfigJson: existingLibrary.config_json,
      watchEnabled,
      scanIntervalMinutes,
      resetScheduledScanAt,
      options,
    });
    return getLibrary(id);
  }

  if (existingLibrary.source === "webdav" && input.source === "webdav") {
    await updateWebdavLibrary({
      id,
      input,
      existingConfigJson: existingLibrary.config_json,
      watchEnabled,
      scanIntervalMinutes,
      resetScheduledScanAt,
      options,
    });
    return getLibrary(id);
  }

  await updateLocalLibrary({
    id,
    input: input as UpdateLocalLibraryInput,
    watchEnabled,
    scanIntervalMinutes,
    resetScheduledScanAt,
  });
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
