-- Query optimization indexes for browse, scan jobs, playback sessions, and watch progress lookups.

CREATE INDEX IF NOT EXISTS watch_progress_media_item_idx ON watch_progress(media_item_id);
CREATE INDEX IF NOT EXISTS watch_progress_media_file_idx ON watch_progress(media_file_id);
CREATE INDEX IF NOT EXISTS watch_progress_continue_idx
  ON watch_progress(user_id, completed, position_seconds, media_item_id, updated_at);

CREATE INDEX IF NOT EXISTS scan_job_kind_library_created_idx ON scan_job(job_kind, library_id, created_at);
CREATE INDEX IF NOT EXISTS scan_job_status_updated_created_idx ON scan_job(status, updated_at, created_at);

CREATE INDEX IF NOT EXISTS playback_session_user_status_mode_idx
  ON playback_session(user_id, media_file_id, mode, status);
CREATE INDEX IF NOT EXISTS playback_session_status_updated_created_idx
  ON playback_session(status, updated_at, created_at);

-- The old non-unique session index is superseded by the unique index below, which also
-- enforces the data model invariant of one artifact per playback session and enables
-- atomic upserts for HLS artifact registration.
DROP INDEX IF EXISTS playback_hls_artifact_session_idx;

CREATE UNIQUE INDEX IF NOT EXISTS playback_hls_artifact_session_unique_idx
  ON playback_hls_artifact(playback_session_id);

CREATE INDEX IF NOT EXISTS media_item_kind_title_year_idx ON media_item(kind, title, year);
CREATE INDEX IF NOT EXISTS media_item_episode_lookup_idx
  ON media_item(kind, parent_id, season_number, episode_number);

CREATE INDEX IF NOT EXISTS subtitle_track_item_source_file_idx
  ON subtitle_track(media_item_id, source_kind, media_file_id);
