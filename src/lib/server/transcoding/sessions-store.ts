import { getDb } from "../db";
import { hlsSegmentIndex } from "./hls";
import type { TranscodePipeline, TranscodeSessionStatus, TranscodeMode } from "../db/schema/streaming";
import { nowIso } from "../time";
import { randomUUID } from "node:crypto";
import { accessibleLibrarySql } from "../media/catalog";
import { releasePlaybackCacheForSession } from "./cache";
import { normalizedStartTimeSeconds } from "./normalization";
import {
  clearPlaybackSessionArtifacts,
  endedPlaybackArtifactActivityAt,
  ENDED_PLAYBACK_ARTIFACT_MAX_IDLE_MS,
  latestActivityAt,
} from "./session-artifacts";

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
  encodeArtifactDirectory: string | null;
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
  errorMessage: string | null;
  playlistPath: string | null;
  cacheId: string | null;
  startTimeSeconds: number;
  durationSeconds: number | null;
  lastSegmentName: string | null;
  lastSegmentIndex: number | null;
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
  lastSegmentName: string | null;
  pipeline: TranscodePipeline | null;
};

const INTERRUPTED_TRANSCODE_MESSAGE = "Playback session was interrupted by a server restart.";
const RECENT_FAILED_PLAYBACK_SESSION_MAX_IDLE_MS = 60_000;
const ACTIVE_TRANSCODE_START_TIME_TOLERANCE_SECONDS = 2;
let transcodeTouchDelayForTests: (() => Promise<void> | void) | null = null;

type TranscodeTouchOptions = {
  signal?: AbortSignal;
};

export function setTranscodeTouchDelayForTests(delay: (() => Promise<void> | void) | null) {
  transcodeTouchDelayForTests = delay;
}

type ActiveHlsArtifactRow = Awaited<ReturnType<ReturnType<typeof activeHlsArtifactBaseQuery>["execute"]>>[number];

function activeHlsArtifactBaseQuery(db: Awaited<ReturnType<typeof getDb>>) {
  return db
    .selectFrom("playback_session")
    .innerJoin("media_file", "media_file.id", "playback_session.media_file_id")
    .leftJoin("playback_hls_artifact", (join) =>
      join.onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .leftJoin("playback_hls_cache", "playback_hls_cache.id", "playback_session.cache_id")
    .select([
      "playback_session.id as sessionId",
      "playback_session.media_file_id as mediaFileId",
      "playback_session.user_id as userId",
      "playback_session.mode as mode",
      "playback_session.pipeline as pipeline",
      "playback_session.status as status",
      "playback_session.error_message as errorMessage",
      "playback_hls_artifact.path as playlistPath",
      "playback_hls_cache.artifact_dir as encodeArtifactDirectory",
      "playback_session.start_time_seconds as startTimeSeconds",
      "media_file.duration_seconds as durationSeconds",
      "playback_session.created_at as createdAt",
      "playback_session.updated_at as updatedAt",
      "playback_session.last_heartbeat_at as lastHeartbeatAt",
      "playback_session.last_segment_request_at as lastSegmentRequestAt",
    ]);
}

function toActiveHlsArtifact(row: ActiveHlsArtifactRow): ActiveHlsArtifact {
  return {
    sessionId: row.sessionId,
    mediaFileId: row.mediaFileId,
    userId: row.userId,
    mode: row.mode,
    pipeline: row.pipeline,
    status: row.status,
    errorMessage: row.errorMessage,
    playlistPath: row.playlistPath,
    encodeArtifactDirectory: row.encodeArtifactDirectory,
    startTimeSeconds: row.startTimeSeconds,
    durationSeconds: row.durationSeconds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastSegmentRequestAt: row.lastSegmentRequestAt,
  };
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

  await db.updateTable("playback_session").set(values).where("id", "=", sessionId).execute();
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

export async function updateTranscodeSessionMode(sessionId: string, mode: TranscodeMode) {
  const db = await getDb();
  const result = await db
    .updateTable("playback_session")
    .set({ mode, updated_at: nowIso() })
    .where("id", "=", sessionId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}

export async function updateTranscodeSessionPipeline(sessionId: string, pipeline: TranscodePipeline) {
  const db = await getDb();
  const result = await db
    .updateTable("playback_session")
    .set({ pipeline, updated_at: nowIso() })
    .where("id", "=", sessionId)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}

export async function registerTranscodeHlsArtifact(input: RegisterTranscodeHlsArtifactInput) {
  const db = await getDb();
  const now = nowIso();
  const artifactId = randomUUID();

  const row = await db
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
    .onConflict((oc) =>
      oc.column("playback_session_id").doUpdateSet({
        media_file_id: input.mediaFileId,
        path: input.path,
        mime_type: input.mimeType ?? null,
        updated_at: now,
      }),
    )
    .returning("id")
    .executeTakeFirst();

  return row?.id ?? artifactId;
}

export async function deleteTranscodeHlsArtifacts(sessionId: string) {
  const db = await getDb();
  await db.deleteFrom("playback_hls_artifact").where("playback_session_id", "=", sessionId).execute();
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

  return rows.filter((row) => latestActivityAt(row) < cutoffIso).map((row) => ({ sessionId: row.sessionId }));
}

export async function listActiveTranscodeSessions(limit = 100): Promise<ActiveTranscodeSession[]> {
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
      join.onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
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

export async function listRunningHlsTranscodeSessions(limit = 50): Promise<RunningHlsTranscodeSession[]> {
  const db = await getDb();
  const rows = await db
    .selectFrom("playback_session")
    .innerJoin("playback_hls_artifact", (join) =>
      join.onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select([
      "playback_session.id as sessionId",
      "playback_session.last_segment_index as lastSegmentIndex",
      "playback_session.last_segment_name as lastSegmentName",
      "playback_session.pipeline as pipeline",
      "playback_hls_artifact.path as playlistPath",
    ])
    .where("playback_session.status", "=", "running")
    .orderBy("playback_session.updated_at", "asc")
    .limit(limit)
    .execute();

  return rows.filter(
    (row): row is RunningHlsTranscodeSession => typeof row.playlistPath === "string" && row.playlistPath.length > 0,
  );
}

export async function getAuthorizedHlsArtifact(
  sessionId: string,
  userId: string,
): Promise<AuthorizedHlsArtifact | null> {
  const db = await getDb();
  const row = await activeHlsArtifactBaseQuery(db)
    .where("playback_session.id", "=", sessionId)
    .where(accessibleLibrarySql(userId, "media_file.library_id"))
    .executeTakeFirst();

  if (!row || row.userId !== userId) return null;
  return toActiveHlsArtifact(row);
}

export async function findActiveHlsArtifact(
  mediaFileId: string,
  userId: string,
  mode: TranscodeMode,
  startTimeSeconds: number | null = 0,
): Promise<ActiveHlsArtifact | null> {
  const db = await getDb();
  const rows = await activeHlsArtifactBaseQuery(db)
    .where("playback_session.media_file_id", "=", mediaFileId)
    .where("playback_session.user_id", "=", userId)
    .where("playback_session.mode", "=", mode)
    .where("playback_session.status", "in", ["queued", "running"])
    .orderBy("playback_session.updated_at", "desc")
    .execute();
  const row = rows.find(
    (item) =>
      (startTimeSeconds === null ||
        Math.abs(item.startTimeSeconds - startTimeSeconds) <= ACTIVE_TRANSCODE_START_TIME_TOLERANCE_SECONDS) &&
      (item.status === "queued" || item.status === "running"),
  );

  return row ? toActiveHlsArtifact(row) : null;
}

export async function findRecentFailedHlsPlayback(
  mediaFileId: string,
  userId: string,
  mode: TranscodeMode,
  startTimeSeconds: number | null = 0,
): Promise<ActiveHlsArtifact | null> {
  const db = await getDb();
  const failedPlaybackCutoff = new Date(Date.now() - RECENT_FAILED_PLAYBACK_SESSION_MAX_IDLE_MS).toISOString();
  const rows = await activeHlsArtifactBaseQuery(db)
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
      Math.abs(item.startTimeSeconds - startTimeSeconds) <= ACTIVE_TRANSCODE_START_TIME_TOLERANCE_SECONDS,
  );

  return row ? toActiveHlsArtifact(row) : null;
}

export async function listActiveHlsPlaybackSessionsForMedia(
  mediaFileId: string,
  userId: string,
  mode: TranscodeMode,
): Promise<ActiveHlsArtifact[]> {
  const db = await getDb();
  const rows = await activeHlsArtifactBaseQuery(db)
    .where("playback_session.media_file_id", "=", mediaFileId)
    .where("playback_session.user_id", "=", userId)
    .where("playback_session.mode", "=", mode)
    .where("playback_session.status", "in", ["queued", "running"])
    .orderBy("playback_session.updated_at", "desc")
    .execute();

  return rows.map(toActiveHlsArtifact);
}

export async function listMismatchedActiveHlsArtifacts(
  mediaFileId: string,
  userId: string,
  mode: TranscodeMode,
  startTimeSeconds: number,
): Promise<ActiveHlsArtifact[]> {
  const db = await getDb();
  const rows = await activeHlsArtifactBaseQuery(db)
    .where("playback_session.media_file_id", "=", mediaFileId)
    .where("playback_session.user_id", "=", userId)
    .where("playback_session.mode", "=", mode)
    .where("playback_session.status", "in", ["queued", "running", "completed"])
    .orderBy("playback_session.updated_at", "desc")
    .execute();

  const endedArtifactCutoff = new Date(Date.now() - ENDED_PLAYBACK_ARTIFACT_MAX_IDLE_MS).toISOString();

  return rows
    .filter(
      (item) =>
        Math.abs(item.startTimeSeconds - startTimeSeconds) > ACTIVE_TRANSCODE_START_TIME_TOLERANCE_SECONDS &&
        (item.status === "queued" ||
          item.status === "running" ||
          endedPlaybackArtifactActivityAt(item) >= endedArtifactCutoff),
    )
    .map(toActiveHlsArtifact);
}

export async function getTranscodeSession(sessionId: string): Promise<TranscodeSessionRecord | null> {
  const db = await getDb();
  const row = await db
    .selectFrom("playback_session")
    .innerJoin("media_file", "media_file.id", "playback_session.media_file_id")
    .leftJoin("playback_hls_artifact", (join) =>
      join.onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
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
      "playback_session.cache_id as cacheId",
      "playback_session.start_time_seconds as startTimeSeconds",
      "playback_session.last_segment_name as lastSegmentName",
      "playback_session.last_segment_index as lastSegmentIndex",
      "media_file.duration_seconds as durationSeconds",
    ])
    .where("playback_session.id", "=", sessionId)
    .executeTakeFirst();

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
        cacheId: row.cacheId,
        startTimeSeconds: row.startTimeSeconds,
        durationSeconds: row.durationSeconds,
        lastSegmentName: row.lastSegmentName,
        lastSegmentIndex: row.lastSegmentIndex,
      }
    : null;
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
      join.onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select(["playback_session.id as sessionId", "playback_hls_artifact.path as playlistPath"])
    .where("playback_session.status", "in", ["queued", "running"])
    .execute();

  let failed = 0;
  let cleaned = 0;

  for (const session of activeSessions) {
    await updateTranscodeSessionStatus(session.sessionId, "failed", errorMessage);
    await releasePlaybackCacheForSession(session.sessionId).catch(() => undefined);
    cleaned += await clearPlaybackSessionArtifacts({
      sessionId: session.sessionId,
      playlistPath: session.playlistPath,
    });
    failed += 1;
  }

  return { failed, cleaned };
}
