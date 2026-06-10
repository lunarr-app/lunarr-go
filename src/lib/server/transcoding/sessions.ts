import { getDb } from "../db";
import { hlsSegmentIndex } from "./hls";
import type {
  TranscodePipeline,
  TranscodeSessionStatus,
  TranscodeMode,
} from "../db/schema/streaming";
import { currentDatabasePaths } from "../db";
import { nowIso } from "../time";
import { randomUUID } from "node:crypto";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { sql } from "kysely";
import { getSetting, setSetting } from "../settings";

export type CreateTranscodeSessionInput = {
  mediaFileId: string;
  userId: string;
  mode?: TranscodeMode;
  startTimeSeconds?: number | null;
};

export type RegisterTranscodeHlsArtifactInput = {
  sessionId: string;
  mediaFileId: string;
  path: string;
  mimeType?: string | null;
};

export type AuthorizedHlsArtifact = {
  sessionId: string;
  mediaFileId: string;
  userId: string | null;
  mode: TranscodeMode;
  pipeline: TranscodePipeline | null;
  status: TranscodeSessionStatus;
  errorMessage: string | null;
  playlistPath: string | null;
  startTimeSeconds: number;
  durationSeconds: number | null;
  updatedAt: string;
  lastSegmentRequestAt: string | null;
};

export type ActiveHlsArtifact = AuthorizedHlsArtifact & {
  createdAt: string;
  updatedAt: string;
};

export type RecoveredTranscodeSessions = {
  failed: number;
  cleaned: number;
};

export type TranscodeSessionRecord = {
  sessionId: string;
  mediaFileId: string;
  userId: string | null;
  mode: TranscodeMode;
  pipeline: TranscodePipeline | null;
  status: TranscodeSessionStatus;
  playlistPath: string | null;
  startTimeSeconds: number;
  durationSeconds: number | null;
};

export type CleanedPlaybackSessionArtifacts = {
  sessions: number;
  cleaned: number;
};

export type StaleTranscodeSession = {
  sessionId: string;
};

export type ActiveTranscodeSession = {
  sessionId: string;
};

export type IdleReadyHlsTranscodeSession = {
  sessionId: string;
};

export type RunningHlsTranscodeSession = {
  sessionId: string;
  playlistPath: string;
  lastSegmentIndex: number | null;
  pipeline: TranscodePipeline | null;
};

type OrphanedPlaybackSessionArtifactDirectory = {
  directory: string;
  mtimeMs: number;
  bytes: number;
};

const INTERRUPTED_TRANSCODE_MESSAGE =
  "Playback session was interrupted by a server restart.";
const DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS = [
  5 * 1024 * 1024 * 1024,
  10 * 1024 * 1024 * 1024,
  20 * 1024 * 1024 * 1024,
  50 * 1024 * 1024 * 1024,
  100 * 1024 * 1024 * 1024,
] as const;
export const DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_BYTES =
  20 * 1024 * 1024 * 1024;
const PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_KEY =
  "playback_session_artifact_max_bytes";
const ENDED_PLAYBACK_ARTIFACT_MAX_IDLE_MS = 60_000;
const RECENT_FAILED_PLAYBACK_SESSION_MAX_IDLE_MS = 60_000;
const ACTIVE_TRANSCODE_START_TIME_TOLERANCE_SECONDS = 2;
let transcodeTouchDelayForTests: (() => Promise<void> | void) | null = null;

type TranscodeTouchOptions = {
  signal?: AbortSignal;
};

export function setTranscodeTouchDelayForTests(
  delay: (() => Promise<void> | void) | null,
) {
  transcodeTouchDelayForTests = delay;
}

function playbackSessionArtifactRoot() {
  return path.join(currentDatabasePaths().dataDir, "playback-sessions");
}

function defaultPlaybackSessionArtifactDirectory(sessionId: string) {
  return path.join(playbackSessionArtifactRoot(), sessionId);
}

function isPathInside(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isPathSameOrInside(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safePlaybackSessionArtifactDirectories(input: {
  sessionId: string;
  playlistPath: string | null;
}) {
  const root = playbackSessionArtifactRoot();
  const directories = new Set([
    defaultPlaybackSessionArtifactDirectory(input.sessionId),
  ]);
  if (input.playlistPath) directories.add(path.dirname(input.playlistPath));

  const safeDirectories = [...directories].filter((directory) =>
    isPathInside(root, directory),
  );
  return safeDirectories.filter(
    (directory) =>
      !safeDirectories.some(
        (other) => other !== directory && isPathSameOrInside(other, directory),
      ),
  );
}

function normalizedStartTimeSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function latestActivityAt(input: {
  lastHeartbeatAt?: string | null;
  lastSegmentRequestAt?: string | null;
  updatedAt: string;
}) {
  return [input.lastHeartbeatAt, input.lastSegmentRequestAt, input.updatedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)!;
}

function endedPlaybackArtifactActivityAt(input: {
  lastSegmentRequestAt?: string | null;
  updatedAt: string;
}) {
  return [input.lastSegmentRequestAt, input.updatedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)!;
}

export function isEndedPlaybackArtifactFresh(input: {
  lastSegmentRequestAt?: string | null;
  updatedAt: string;
}) {
  const endedArtifactCutoff = new Date(
    Date.now() - ENDED_PLAYBACK_ARTIFACT_MAX_IDLE_MS,
  ).toISOString();
  return endedPlaybackArtifactActivityAt(input) >= endedArtifactCutoff;
}

export function normalizePlaybackSessionArtifactMaxBytes(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(String(value ?? ""));
  return PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS.includes(
    numeric as (typeof PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS)[number],
  )
    ? numeric
    : DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_BYTES;
}

export async function getPlaybackSessionArtifactMaxBytes() {
  return normalizePlaybackSessionArtifactMaxBytes(
    await getSetting(PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_KEY),
  );
}

export async function setPlaybackSessionArtifactMaxBytes(value: unknown) {
  await setSetting(
    PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_KEY,
    String(normalizePlaybackSessionArtifactMaxBytes(value)),
  );
}

async function directorySizeBytes(directory: string): Promise<number> {
  let details;
  try {
    details = await stat(directory);
  } catch {
    return 0;
  }
  if (!details.isDirectory()) return details.size;

  let total = 0;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await directorySizeBytes(entryPath);
    } else if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}

async function removeSafePlaybackSessionArtifactDirectories(input: {
  sessionId: string;
  playlistPath: string | null;
}) {
  const directories = safePlaybackSessionArtifactDirectories(input);
  let cleaned = 0;
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true });
    cleaned += 1;
  }
  return cleaned;
}

async function listOrphanedPlaybackSessionArtifactDirectories(
  knownSessionIds: Set<string>,
): Promise<OrphanedPlaybackSessionArtifactDirectory[]> {
  const root = playbackSessionArtifactRoot();
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const directories: OrphanedPlaybackSessionArtifactDirectory[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || knownSessionIds.has(entry.name)) continue;
    const directory = path.join(root, entry.name);
    const details = await stat(directory).catch(() => null);
    if (!details?.isDirectory()) continue;
    directories.push({
      directory,
      mtimeMs: details.mtimeMs,
      bytes: await directorySizeBytes(directory),
    });
  }

  return directories;
}

async function clearPlaybackSessionArtifacts(input: {
  sessionId: string;
  playlistPath: string | null;
}) {
  const cleaned = await removeSafePlaybackSessionArtifactDirectories(input);
  const db = await getDb();
  await db
    .deleteFrom("playback_hls_artifact")
    .where("playback_session_id", "=", input.sessionId)
    .execute();
  return cleaned;
}

export async function createTranscodeSession(input: CreateTranscodeSessionInput) {
  const db = await getDb();
  const now = nowIso();
  const sessionId = randomUUID();

  await db
    .insertInto("playback_session")
    .values({
      id: sessionId,
      media_file_id: input.mediaFileId,
      user_id: input.userId,
      status: "queued",
      mode: input.mode ?? "transcode",
      pipeline: null,
      error_message: null,
      last_heartbeat_at: now,
      last_segment_request_at: null,
      last_segment_name: null,
      last_segment_index: null,
      start_time_seconds: normalizedStartTimeSeconds(input.startTimeSeconds),
      started_at: null,
      finished_at: null,
      created_at: now,
      updated_at: now,
    })
    .execute();

  return sessionId;
}

export async function updateTranscodeSessionStatus(
  sessionId: string,
  status: TranscodeSessionStatus,
  errorMessage: string | null = null,
) {
  const db = await getDb();
  const now = nowIso();
  const values: {
    status: TranscodeSessionStatus;
    error_message: string | null;
    started_at?: string;
    finished_at?: string;
    updated_at: string;
  } = {
    status,
    error_message: errorMessage,
    updated_at: now,
  };
  if (status === "running") values.started_at = now;
  if (status === "completed" || status === "failed" || status === "cancelled") {
    values.finished_at = now;
  }

  await db
    .updateTable("playback_session")
    .set(values)
    .where("id", "=", sessionId)
    .execute();
}

export async function updateActiveTranscodeSessionStatus(
  sessionId: string,
  status: TranscodeSessionStatus,
  errorMessage: string | null = null,
) {
  const db = await getDb();
  const now = nowIso();
  const values: {
    status: TranscodeSessionStatus;
    error_message: string | null;
    started_at?: string;
    finished_at?: string;
    updated_at: string;
  } = {
    status,
    error_message: errorMessage,
    updated_at: now,
  };
  if (status === "running") values.started_at = now;
  if (status === "completed" || status === "failed" || status === "cancelled") {
    values.finished_at = now;
  }

  const result = await db
    .updateTable("playback_session")
    .set(values)
    .where("id", "=", sessionId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}

export async function updateTranscodeSessionMode(
  sessionId: string,
  mode: TranscodeMode,
) {
  const db = await getDb();
  const result = await db
    .updateTable("playback_session")
    .set({ mode, updated_at: nowIso() })
    .where("id", "=", sessionId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}

export async function updateTranscodeSessionPipeline(
  sessionId: string,
  pipeline: TranscodePipeline,
) {
  const db = await getDb();
  const result = await db
    .updateTable("playback_session")
    .set({ pipeline, updated_at: nowIso() })
    .where("id", "=", sessionId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}

export async function registerTranscodeHlsArtifact(
  input: RegisterTranscodeHlsArtifactInput,
) {
  const db = await getDb();
  const now = nowIso();
  const existing = await db
    .selectFrom("playback_hls_artifact")
    .select("id")
    .where("playback_session_id", "=", input.sessionId)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable("playback_hls_artifact")
      .set({
        media_file_id: input.mediaFileId,
        path: input.path,
        mime_type: input.mimeType ?? null,
        updated_at: now,
      })
      .where("id", "=", existing.id)
      .execute();

    return existing.id;
  }

  const artifactId = randomUUID();

  await db
    .insertInto("playback_hls_artifact")
    .values({
      id: artifactId,
      playback_session_id: input.sessionId,
      media_file_id: input.mediaFileId,
      path: input.path,
      mime_type: input.mimeType ?? null,
      created_at: now,
      updated_at: now,
    })
    .execute();

  return artifactId;
}

export async function deleteTranscodeHlsArtifacts(sessionId: string) {
  const db = await getDb();
  await db
    .deleteFrom("playback_hls_artifact")
    .where("playback_session_id", "=", sessionId)
    .execute();
}

export async function touchTranscodeSessionHeartbeat(
  sessionId: string,
  userId: string,
  options: TranscodeTouchOptions = {},
) {
  if (options.signal?.aborted) return false;

  const db = await getDb();
  const now = nowIso();
  await transcodeTouchDelayForTests?.();
  if (options.signal?.aborted) return false;

  const result = await db
    .updateTable("playback_session")
    .set({ last_heartbeat_at: now, updated_at: now })
    .where("id", "=", sessionId)
    .where("user_id", "=", userId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}

export async function touchTranscodeSessionSegmentRequest(
  sessionId: string,
  userId: string,
  segmentName: string,
  options: TranscodeTouchOptions = {},
) {
  const segmentIndex = hlsSegmentIndex(segmentName);
  if (segmentIndex === null) return false;
  if (options.signal?.aborted) return false;

  const db = await getDb();
  const now = nowIso();
  await transcodeTouchDelayForTests?.();
  if (options.signal?.aborted) return false;

  const result = await db
    .updateTable("playback_session")
    .set({
      last_heartbeat_at: now,
      last_segment_request_at: now,
      last_segment_name: segmentName,
      last_segment_index: segmentIndex,
      updated_at: now,
    })
    .where("id", "=", sessionId)
    .where("user_id", "=", userId)
    .where("status", "in", ["queued", "running", "completed"])
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}

export async function listStaleActiveTranscodeSessions(
  cutoffIso: string,
  limit = 50,
): Promise<StaleTranscodeSession[]> {
  const db = await getDb();
  const rows = await db
    .selectFrom("playback_session")
    .select([
      "id as sessionId",
      "last_heartbeat_at as lastHeartbeatAt",
      "last_segment_request_at as lastSegmentRequestAt",
      "updated_at as updatedAt",
    ])
    .where("status", "in", ["queued", "running"])
    .orderBy("created_at", "asc")
    .limit(limit)
    .execute();

  return rows
    .filter((row) => latestActivityAt(row) < cutoffIso)
    .map((row) => ({ sessionId: row.sessionId }));
}

export async function listActiveTranscodeSessions(
  limit = 100,
): Promise<ActiveTranscodeSession[]> {
  const db = await getDb();
  const rows = await db
    .selectFrom("playback_session")
    .select("id as sessionId")
    .where("status", "in", ["queued", "running"])
    .orderBy("created_at", "asc")
    .limit(limit)
    .execute();

  return rows;
}

export async function listIdleReadyHlsTranscodeSessions(
  cutoffIso: string,
  limit = 50,
): Promise<IdleReadyHlsTranscodeSession[]> {
  const db = await getDb();
  const rows = await db
    .selectFrom("playback_session")
    .innerJoin("playback_hls_artifact", (join) =>
      join
        .onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select([
      "playback_session.id as sessionId",
      "playback_session.last_heartbeat_at as lastHeartbeatAt",
      "playback_session.last_segment_request_at as lastSegmentRequestAt",
      "playback_hls_artifact.updated_at as hlsReadyAt",
    ])
    .where("playback_session.status", "=", "running")
    .orderBy("playback_hls_artifact.updated_at", "asc")
    .limit(limit)
    .execute();

  return rows
    .filter(
      (row) =>
        latestActivityAt({
          lastHeartbeatAt: row.lastHeartbeatAt,
          lastSegmentRequestAt: row.lastSegmentRequestAt,
          updatedAt: row.hlsReadyAt,
        }) < cutoffIso,
    )
    .map((row) => ({ sessionId: row.sessionId }));
}

export async function listRunningHlsTranscodeSessions(
  limit = 50,
): Promise<RunningHlsTranscodeSession[]> {
  const db = await getDb();
  const rows = await db
    .selectFrom("playback_session")
    .innerJoin("playback_hls_artifact", (join) =>
      join
        .onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select([
      "playback_session.id as sessionId",
      "playback_session.last_segment_index as lastSegmentIndex",
      "playback_session.pipeline as pipeline",
      "playback_hls_artifact.path as playlistPath",
    ])
    .where("playback_session.status", "=", "running")
    .orderBy("playback_session.updated_at", "asc")
    .limit(limit)
    .execute();

  return rows.filter((row): row is RunningHlsTranscodeSession =>
    typeof row.playlistPath === "string" && row.playlistPath.length > 0,
  );
}

export async function getAuthorizedHlsArtifact(
  sessionId: string,
  userId: string,
): Promise<AuthorizedHlsArtifact | null> {
  const db = await getDb();
  const row = await db
    .selectFrom("playback_session")
    .innerJoin("media_file", "media_file.id", "playback_session.media_file_id")
    .leftJoin("playback_hls_artifact", (join) =>
      join
        .onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select([
      "playback_session.id as sessionId",
      "playback_session.media_file_id as mediaFileId",
      "playback_session.user_id as userId",
      "playback_session.mode as mode",
      "playback_session.pipeline as pipeline",
      "playback_session.status as status",
      "playback_session.error_message as errorMessage",
      "playback_hls_artifact.path as playlistPath",
      "playback_session.start_time_seconds as startTimeSeconds",
      "media_file.duration_seconds as durationSeconds",
      "playback_session.updated_at as updatedAt",
      "playback_session.last_segment_request_at as lastSegmentRequestAt",
    ])
    .where("playback_session.id", "=", sessionId)
    .where(sql<boolean>`(
      exists (
        select 1 from user
        where user.id = ${userId}
          and user.role = 'admin'
      )
      or exists (
        select 1 from library
        where library.id = media_file.library_id
          and library.access_mode = 'all'
      )
      or exists (
        select 1 from library_user
        where library_user.library_id = media_file.library_id
          and library_user.user_id = ${userId}
      )
    )`)
    .executeTakeFirst();

  if (!row || row.userId !== userId) return null;
  return row;
}

export async function findActiveHlsArtifact(
  mediaFileId: string,
  userId: string,
  mode: TranscodeMode,
  startTimeSeconds: number | null = 0,
): Promise<ActiveHlsArtifact | null> {
  const db = await getDb();
  const rows = await db
    .selectFrom("playback_session")
    .innerJoin("media_file", "media_file.id", "playback_session.media_file_id")
    .leftJoin("playback_hls_artifact", (join) =>
      join
        .onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select([
      "playback_session.id as sessionId",
      "playback_session.media_file_id as mediaFileId",
      "playback_session.user_id as userId",
      "playback_session.mode as mode",
      "playback_session.pipeline as pipeline",
      "playback_session.status as status",
      "playback_session.error_message as errorMessage",
      "playback_hls_artifact.path as playlistPath",
      "playback_session.start_time_seconds as startTimeSeconds",
      "media_file.duration_seconds as durationSeconds",
      "playback_session.created_at as createdAt",
      "playback_session.updated_at as updatedAt",
      "playback_session.last_heartbeat_at as lastHeartbeatAt",
      "playback_session.last_segment_request_at as lastSegmentRequestAt",
    ])
    .where("playback_session.media_file_id", "=", mediaFileId)
    .where("playback_session.user_id", "=", userId)
    .where("playback_session.mode", "=", mode)
    .where("playback_session.status", "in", ["queued", "running"])
    .orderBy("playback_session.updated_at", "desc")
    .execute();
  const row = rows.find(
    (item) =>
      (startTimeSeconds === null ||
        Math.abs(item.startTimeSeconds - startTimeSeconds) <=
          ACTIVE_TRANSCODE_START_TIME_TOLERANCE_SECONDS) &&
      (item.status === "queued" || item.status === "running"),
  );

  return row
    ? {
        sessionId: row.sessionId,
        mediaFileId: row.mediaFileId,
        userId: row.userId,
        mode: row.mode,
        pipeline: row.pipeline,
        status: row.status,
        errorMessage: row.errorMessage,
        playlistPath: row.playlistPath,
        startTimeSeconds: row.startTimeSeconds,
        durationSeconds: row.durationSeconds,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastSegmentRequestAt: row.lastSegmentRequestAt,
      }
    : null;
}

export async function findRecentFailedHlsPlayback(
  mediaFileId: string,
  userId: string,
  mode: TranscodeMode,
  startTimeSeconds: number | null = 0,
): Promise<ActiveHlsArtifact | null> {
  const db = await getDb();
  const failedPlaybackCutoff = new Date(
    Date.now() - RECENT_FAILED_PLAYBACK_SESSION_MAX_IDLE_MS,
  ).toISOString();
  const rows = await db
    .selectFrom("playback_session")
    .innerJoin("media_file", "media_file.id", "playback_session.media_file_id")
    .leftJoin("playback_hls_artifact", (join) =>
      join
        .onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select([
      "playback_session.id as sessionId",
      "playback_session.media_file_id as mediaFileId",
      "playback_session.user_id as userId",
      "playback_session.mode as mode",
      "playback_session.pipeline as pipeline",
      "playback_session.status as status",
      "playback_session.error_message as errorMessage",
      "playback_hls_artifact.path as playlistPath",
      "playback_session.start_time_seconds as startTimeSeconds",
      "media_file.duration_seconds as durationSeconds",
      "playback_session.created_at as createdAt",
      "playback_session.updated_at as updatedAt",
      "playback_session.last_segment_request_at as lastSegmentRequestAt",
    ])
    .where("playback_session.media_file_id", "=", mediaFileId)
    .where("playback_session.user_id", "=", userId)
    .where("playback_session.mode", "=", mode)
    .where("playback_session.status", "=", "failed")
    .where("playback_session.updated_at", ">=", failedPlaybackCutoff)
    .orderBy("playback_session.updated_at", "desc")
    .execute();
  const row = rows.find(
    (item) =>
      startTimeSeconds === null ||
      Math.abs(item.startTimeSeconds - startTimeSeconds) <=
        ACTIVE_TRANSCODE_START_TIME_TOLERANCE_SECONDS,
  );

  return row
    ? {
        sessionId: row.sessionId,
        mediaFileId: row.mediaFileId,
        userId: row.userId,
        mode: row.mode,
        pipeline: row.pipeline,
        status: row.status,
        errorMessage: row.errorMessage,
        playlistPath: row.playlistPath,
        startTimeSeconds: row.startTimeSeconds,
        durationSeconds: row.durationSeconds,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastSegmentRequestAt: row.lastSegmentRequestAt,
      }
    : null;
}

export async function listMismatchedActiveHlsArtifacts(
  mediaFileId: string,
  userId: string,
  mode: TranscodeMode,
  startTimeSeconds: number,
): Promise<ActiveHlsArtifact[]> {
  const db = await getDb();
  const rows = await db
    .selectFrom("playback_session")
    .innerJoin("media_file", "media_file.id", "playback_session.media_file_id")
    .leftJoin("playback_hls_artifact", (join) =>
      join
        .onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select([
      "playback_session.id as sessionId",
      "playback_session.media_file_id as mediaFileId",
      "playback_session.user_id as userId",
      "playback_session.mode as mode",
      "playback_session.pipeline as pipeline",
      "playback_session.status as status",
      "playback_session.error_message as errorMessage",
      "playback_hls_artifact.path as playlistPath",
      "playback_session.start_time_seconds as startTimeSeconds",
      "media_file.duration_seconds as durationSeconds",
      "playback_session.created_at as createdAt",
      "playback_session.updated_at as updatedAt",
      "playback_session.last_heartbeat_at as lastHeartbeatAt",
      "playback_session.last_segment_request_at as lastSegmentRequestAt",
    ])
    .where("playback_session.media_file_id", "=", mediaFileId)
    .where("playback_session.user_id", "=", userId)
    .where("playback_session.mode", "=", mode)
    .where("playback_session.status", "in", ["queued", "running", "completed"])
    .orderBy("playback_session.updated_at", "desc")
    .execute();

  const endedArtifactCutoff = new Date(
    Date.now() - ENDED_PLAYBACK_ARTIFACT_MAX_IDLE_MS,
  ).toISOString();

  return rows
    .filter(
      (item) =>
        Math.abs(item.startTimeSeconds - startTimeSeconds) >
          ACTIVE_TRANSCODE_START_TIME_TOLERANCE_SECONDS &&
        (item.status === "queued" ||
          item.status === "running" ||
          endedPlaybackArtifactActivityAt(item) >= endedArtifactCutoff),
    )
    .map((row) => ({
      sessionId: row.sessionId,
      mediaFileId: row.mediaFileId,
      userId: row.userId,
      mode: row.mode,
      pipeline: row.pipeline,
      status: row.status,
      errorMessage: row.errorMessage,
      playlistPath: row.playlistPath,
      startTimeSeconds: row.startTimeSeconds,
      durationSeconds: row.durationSeconds,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastSegmentRequestAt: row.lastSegmentRequestAt,
    }));
}

export async function getTranscodeSession(
  sessionId: string,
): Promise<TranscodeSessionRecord | null> {
  const db = await getDb();
  const row = await db
    .selectFrom("playback_session")
    .innerJoin("media_file", "media_file.id", "playback_session.media_file_id")
    .leftJoin("playback_hls_artifact", (join) =>
      join
        .onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select([
      "playback_session.id as sessionId",
      "playback_session.media_file_id as mediaFileId",
      "playback_session.user_id as userId",
      "playback_session.mode as mode",
      "playback_session.pipeline as pipeline",
      "playback_session.status as status",
      "playback_hls_artifact.path as playlistPath",
      "playback_session.start_time_seconds as startTimeSeconds",
      "media_file.duration_seconds as durationSeconds",
    ])
    .where("playback_session.id", "=", sessionId)
    .executeTakeFirst();

  return row ?? null;
}

export async function isTranscodeSessionActive(sessionId: string) {
  const db = await getDb();
  const row = await db
    .selectFrom("playback_session")
    .select("id")
    .where("id", "=", sessionId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();

  return Boolean(row);
}

export async function recoverInterruptedTranscodeSessions(
  errorMessage = INTERRUPTED_TRANSCODE_MESSAGE,
): Promise<RecoveredTranscodeSessions> {
  const db = await getDb();
  const activeSessions = await db
    .selectFrom("playback_session")
    .leftJoin("playback_hls_artifact", (join) =>
      join
        .onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select([
      "playback_session.id as sessionId",
      "playback_hls_artifact.path as playlistPath",
    ])
    .where("playback_session.status", "in", ["queued", "running"])
    .execute();

  let failed = 0;
  let cleaned = 0;

  for (const session of activeSessions) {
    await updateTranscodeSessionStatus(
      session.sessionId,
      "failed",
      errorMessage,
    );
    cleaned += await clearPlaybackSessionArtifacts({
      sessionId: session.sessionId,
      playlistPath: session.playlistPath,
    });
    failed += 1;
  }

  return { failed, cleaned };
}

export async function cleanupExpiredPlaybackSessionArtifacts(
  maxAgeMs = DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_AGE_MS,
  maxBytes = DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_BYTES,
  endedPlaybackArtifactMaxAgeMs = Math.min(
    maxAgeMs,
    ENDED_PLAYBACK_ARTIFACT_MAX_IDLE_MS,
  ),
): Promise<CleanedPlaybackSessionArtifacts> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - Math.max(0, maxAgeMs)).toISOString();
  const endedPlaybackArtifactCutoff = new Date(
    Date.now() - Math.max(0, endedPlaybackArtifactMaxAgeMs),
  ).toISOString();
  const knownSessionRows = await db
    .selectFrom("playback_session")
    .select("id")
    .execute();
  const knownSessionIds = new Set(knownSessionRows.map((row) => row.id));
  const sessions = await db
    .selectFrom("playback_session")
    .leftJoin("playback_hls_artifact", (join) =>
      join
        .onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select([
      "playback_session.id as sessionId",
      "playback_session.status as status",
      "playback_hls_artifact.path as playlistPath",
      "playback_session.updated_at as updatedAt",
      "playback_session.last_heartbeat_at as lastHeartbeatAt",
      "playback_session.last_segment_request_at as lastSegmentRequestAt",
    ])
    .where("playback_session.status", "in", ["completed", "failed", "cancelled"])
    .orderBy("playback_session.updated_at", "asc")
    .execute();

  const cleanedSessionIds = new Set<string>();
  const cleanedOrphanDirectories = new Set<string>();
  let cleaned = 0;
  const orphanDirectories = await listOrphanedPlaybackSessionArtifactDirectories(knownSessionIds);
  const orphanCutoffMs = Date.now() - Math.max(0, maxAgeMs);
  for (const session of sessions.filter((item) => {
    const sessionCutoff =
      item.status === "completed" ? endedPlaybackArtifactCutoff : cutoff;
    const activityAt =
      item.status === "completed"
        ? endedPlaybackArtifactActivityAt(item)
        : latestActivityAt(item);
    return activityAt < sessionCutoff;
  })) {
    cleaned += await clearPlaybackSessionArtifacts({
      sessionId: session.sessionId,
      playlistPath: session.playlistPath,
    });
    cleanedSessionIds.add(session.sessionId);
  }
  for (const orphan of orphanDirectories.filter(
    (directory) => directory.mtimeMs < orphanCutoffMs,
  )) {
    await rm(orphan.directory, { recursive: true, force: true });
    cleanedOrphanDirectories.add(orphan.directory);
    cleaned += 1;
  }

  const remaining = sessions.filter((session) => !cleanedSessionIds.has(session.sessionId));
  const sessionSizes = await Promise.all(
    remaining.map(async (session) => {
      let bytes = 0;
      for (const directory of safePlaybackSessionArtifactDirectories(session)) {
        bytes += await directorySizeBytes(directory);
      }
      return { ...session, bytes };
    }),
  );
  const remainingOrphanDirectories = orphanDirectories.filter(
    (directory) => !cleanedOrphanDirectories.has(directory.directory),
  );

  let totalBytes =
    sessionSizes.reduce((total, session) => total + session.bytes, 0) +
    remainingOrphanDirectories.reduce((total, directory) => total + directory.bytes, 0);
  const byteLimit = Math.max(0, maxBytes);
  const artifactSizes = [
    ...sessionSizes.map((session) => ({
      kind: "session" as const,
      sortMs: Date.parse(
        session.status === "completed"
          ? endedPlaybackArtifactActivityAt(session)
          : latestActivityAt(session),
      ),
      bytes: session.bytes,
      session,
    })),
    ...remainingOrphanDirectories.map((directory) => ({
      kind: "orphan" as const,
      sortMs: directory.mtimeMs,
      bytes: directory.bytes,
      directory,
    })),
  ].sort((a, b) => a.sortMs - b.sortMs);

  for (const artifact of artifactSizes) {
    if (totalBytes <= byteLimit) break;
    if (artifact.kind === "session") {
      cleaned += await clearPlaybackSessionArtifacts({
        sessionId: artifact.session.sessionId,
        playlistPath: artifact.session.playlistPath,
      });
      cleanedSessionIds.add(artifact.session.sessionId);
    } else {
      await rm(artifact.directory.directory, { recursive: true, force: true });
      cleanedOrphanDirectories.add(artifact.directory.directory);
      cleaned += 1;
    }
    totalBytes -= artifact.bytes;
  }

  return { sessions: cleanedSessionIds.size, cleaned };
}

export async function cleanupConfiguredPlaybackSessionArtifacts(
  maxAgeMs = DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_AGE_MS,
) {
  return cleanupExpiredPlaybackSessionArtifacts(
    maxAgeMs,
    await getPlaybackSessionArtifactMaxBytes(),
  );
}
