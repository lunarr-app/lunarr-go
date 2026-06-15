import { getDb } from "../db";
import { normalizePlaybackSessionMessage } from "../transcoding/messages";

const JOB_HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const JOB_HISTORY_MIN_ROWS = 500;
const JOB_HISTORY_DELETE_BATCH_SIZE = 500;
const CANCELLED_PLAYBACK_SESSION_HISTORY_MAX_AGE_MS = 15 * 60 * 1000;
const COMPLETED_PLAYBACK_SESSION_HISTORY_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const FAILED_PLAYBACK_SESSION_HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_JOB_STATUSES = ["queued", "running"] as const;

export const SCAN_JOB_LIST_LIMIT = 25;
export const PLAYBACK_SESSION_LIST_LIMIT = 25;
export const SCAN_ERROR_LIST_LIMIT = 100;

type CleanupJobHistoryOptions = {
  maxAgeMs?: number;
  minRows?: number;
  now?: Date;
};

function emptyJobSummary() {
  return {
    total: 0,
    active: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    errors: 0,
  };
}

function inactiveHistoryCutoff(options: CleanupJobHistoryOptions) {
  const maxAgeMs = Math.max(0, options.maxAgeMs ?? JOB_HISTORY_MAX_AGE_MS);
  return new Date((options.now ?? new Date()).getTime() - maxAgeMs).toISOString();
}

function historyRetentionRows(options: CleanupJobHistoryOptions) {
  return Math.max(0, Math.floor(options.minRows ?? JOB_HISTORY_MIN_ROWS));
}

function playbackSessionHistoryCutoffs(options: CleanupJobHistoryOptions) {
  const now = (options.now ?? new Date()).getTime();
  return {
    cancelled: new Date(now - CANCELLED_PLAYBACK_SESSION_HISTORY_MAX_AGE_MS).toISOString(),
    completed: new Date(now - COMPLETED_PLAYBACK_SESSION_HISTORY_MAX_AGE_MS).toISOString(),
    failed: new Date(now - FAILED_PLAYBACK_SESSION_HISTORY_MAX_AGE_MS).toISOString(),
  };
}

function chunkIds(ids: string[]) {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += JOB_HISTORY_DELETE_BATCH_SIZE) {
    chunks.push(ids.slice(index, index + JOB_HISTORY_DELETE_BATCH_SIZE));
  }
  return chunks;
}

function applyStatusToSummary<T extends { status: string }>(summary: ReturnType<typeof emptyJobSummary>, job: T) {
  summary.total += 1;
  if (job.status === "queued" || job.status === "running") summary.active += 1;
  if (job.status === "completed") summary.completed += 1;
  if (job.status === "failed") summary.failed += 1;
  if (job.status === "cancelled") summary.cancelled += 1;
}

export async function getScanJobSummary() {
  const db = await getDb();
  const jobs = await db.selectFrom("scan_job").select(["status", "errors_count"]).execute();

  return jobs.reduce((summary, job) => {
    applyStatusToSummary(summary, job);
    summary.errors += Number(job.errors_count ?? 0);
    return summary;
  }, emptyJobSummary());
}

export async function getPlaybackSessionSummary() {
  const db = await getDb();
  const jobs = await db.selectFrom("playback_session").select(["status", "error_message"]).execute();

  return jobs.reduce((summary, job) => {
    applyStatusToSummary(summary, job);
    if (job.error_message) summary.errors += 1;
    return summary;
  }, emptyJobSummary());
}

export async function listScanJobs(limit = SCAN_JOB_LIST_LIMIT) {
  const db = await getDb();
  return db
    .selectFrom("scan_job")
    .leftJoin("library", "library.id", "scan_job.library_id")
    .select([
      "scan_job.id",
      "scan_job.job_kind",
      "scan_job.library_id",
      "scan_job.status",
      "scan_job.started_at",
      "scan_job.finished_at",
      "scan_job.files_seen",
      "scan_job.files_added",
      "scan_job.files_updated",
      "scan_job.files_removed",
      "scan_job.errors_count",
      "scan_job.cancel_requested_at",
      "scan_job.created_at",
      "scan_job.updated_at",
      "library.name as library_name",
    ])
    .orderBy("scan_job.created_at", "desc")
    .limit(limit)
    .execute();
}

export async function listPlaybackSessions(limit = PLAYBACK_SESSION_LIST_LIMIT) {
  const db = await getDb();
  const sessions = await db
    .selectFrom("playback_session")
    .leftJoin("media_file", "media_file.id", "playback_session.media_file_id")
    .leftJoin("media_item", "media_item.id", "media_file.media_item_id")
    .leftJoin("user", "user.id", "playback_session.user_id")
    .select([
      "playback_session.id as playback_session_id",
      "playback_session.media_file_id",
      "playback_session.user_id",
      "playback_session.status",
      "playback_session.mode",
      "playback_session.pipeline",
      "playback_session.start_time_seconds",
      "playback_session.last_heartbeat_at",
      "playback_session.last_segment_request_at",
      "playback_session.last_segment_name",
      "playback_session.last_segment_index",
      "playback_session.error_message",
      "playback_session.started_at",
      "playback_session.finished_at",
      "playback_session.created_at",
      "playback_session.updated_at",
      "media_item.title as media_title",
      "media_item.id as media_item_id",
      "media_item.kind as media_item_kind",
      "media_file.basename as file_basename",
      "user.email as user_email",
    ])
    .orderBy("playback_session.created_at", "desc")
    .limit(limit)
    .execute();

  return sessions.map((session) => ({
    ...session,
    error_message: normalizePlaybackSessionMessage(session.error_message),
  }));
}

export async function listScanErrors(limit = SCAN_ERROR_LIST_LIMIT) {
  const db = await getDb();
  return db
    .selectFrom("scan_job_error")
    .innerJoin("scan_job", "scan_job.id", "scan_job_error.scan_job_id")
    .leftJoin("library", "library.id", "scan_job.library_id")
    .select([
      "scan_job_error.id",
      "scan_job_error.scan_job_id",
      "scan_job_error.path",
      "scan_job_error.message",
      "scan_job_error.created_at",
      "scan_job.status as job_status",
      "scan_job.job_kind",
      "scan_job.library_id",
      "library.name as library_name",
    ])
    .orderBy("scan_job_error.created_at", "desc")
    .limit(limit)
    .execute();
}

export async function cleanupJobHistory(options: CleanupJobHistoryOptions = {}) {
  const db = await getDb();
  const cutoff = inactiveHistoryCutoff(options);
  const keepRows = historyRetentionRows(options);

  const [scanRows, latestLibraryScanRows, playbackRows] = await Promise.all([
    db
      .selectFrom("scan_job")
      .select(["id", "updated_at"])
      .where("status", "not in", ACTIVE_JOB_STATUSES)
      .orderBy("updated_at", "desc")
      .orderBy("created_at", "desc")
      .execute(),
    db
      .selectFrom("scan_job")
      .select(["id", "library_id"])
      .where("job_kind", "=", "library_scan")
      .where("library_id", "is not", null)
      .orderBy("library_id")
      .orderBy("created_at", "desc")
      .execute(),
    db
      .selectFrom("playback_session")
      .select(["id", "status", "updated_at"])
      .where("status", "not in", ACTIVE_JOB_STATUSES)
      .orderBy("updated_at", "desc")
      .orderBy("created_at", "desc")
      .execute(),
  ]);

  const latestLibraryScanIds = new Set<string>();
  const libraryIdsWithLatestScan = new Set<string>();
  for (const job of latestLibraryScanRows) {
    if (job.library_id && !libraryIdsWithLatestScan.has(job.library_id)) {
      latestLibraryScanIds.add(job.id);
      libraryIdsWithLatestScan.add(job.library_id);
    }
  }

  const staleScanJobIds = scanRows
    .slice(keepRows)
    .filter((job) => job.updated_at < cutoff && !latestLibraryScanIds.has(job.id))
    .map((job) => job.id);
  const playbackCutoffs = playbackSessionHistoryCutoffs(options);
  const stalePlaybackSessionIds = playbackRows
    .filter((job) => {
      if (job.status === "cancelled") {
        return job.updated_at < playbackCutoffs.cancelled;
      }
      if (job.status === "completed") {
        return job.updated_at < playbackCutoffs.completed;
      }
      if (job.status === "failed") {
        return job.updated_at < playbackCutoffs.failed;
      }
      return false;
    })
    .map((job) => job.id);

  for (const ids of chunkIds(staleScanJobIds)) {
    await db.deleteFrom("scan_job").where("id", "in", ids).execute();
  }
  for (const ids of chunkIds(stalePlaybackSessionIds)) {
    await db.deleteFrom("playback_session").where("id", "in", ids).execute();
  }

  return {
    scanJobs: staleScanJobIds.length,
    playbackSessions: stalePlaybackSessionIds.length,
  };
}
