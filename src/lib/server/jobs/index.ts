import { getDb } from "../db";
import { normalizePlaybackSessionMessage } from "../transcoding/messages";

function emptyJobSummary() {
  return {
    total: 0,
    active: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    errors: 0
  };
}

function applyStatusToSummary<T extends { status: string }>(
  summary: ReturnType<typeof emptyJobSummary>,
  job: T
) {
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

export async function listScanJobs(limit = 50) {
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
      "library.name as library_name"
    ])
    .orderBy("scan_job.created_at", "desc")
    .limit(limit)
    .execute();
}

export async function listPlaybackSessions(limit = 25) {
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
      "media_file.basename as file_basename",
      "user.email as user_email"
    ])
    .orderBy("playback_session.created_at", "desc")
    .limit(limit)
    .execute();

  return sessions.map((session) => ({
    ...session,
    error_message: normalizePlaybackSessionMessage(session.error_message)
  }));
}

export async function listScanErrors(limit = 100) {
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
      "library.name as library_name"
    ])
    .orderBy("scan_job_error.created_at", "desc")
    .limit(limit)
    .execute();
}
