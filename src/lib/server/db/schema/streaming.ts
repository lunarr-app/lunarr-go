import type { JsonText, TimestampText } from "./common";
import type { ColumnType } from "kysely";

export type TranscodeSessionStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type TranscodeMode = "remux" | "transcode";
export type TranscodePipeline = "request_driven";
export type MediaStreamType = "video" | "audio" | "subtitle" | "data";

export type PlaybackSessionTable = {
  id: string;
  media_file_id: string;
  user_id: string | null;
  status: TranscodeSessionStatus;
  mode: TranscodeMode;
  pipeline: ColumnType<
    TranscodePipeline | null,
    TranscodePipeline | null | undefined,
    TranscodePipeline | null | undefined
  >;
  error_message: string | null;
  last_heartbeat_at: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  last_segment_request_at: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  last_segment_name: string | null;
  last_segment_index: number | null;
  start_time_seconds: ColumnType<number, number | undefined, number | undefined>;
  cache_id: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  started_at: string | null;
  finished_at: string | null;
  created_at: TimestampText;
  updated_at: TimestampText;
};

export type PlaybackHlsCacheTable = {
  id: string;
  media_file_id: string;
  mode: TranscodeMode;
  policy_hash: string;
  file_size_bytes: number;
  file_mtime_ms: number;
  artifact_dir: string;
  furthest_segment_index: number | null;
  bytes: number;
  ref_count: number;
  last_access_at: string;
  created_at: TimestampText;
  updated_at: TimestampText;
};

export type PlaybackHlsArtifactTable = {
  id: string;
  playback_session_id: string;
  media_file_id: string;
  path: string;
  mime_type: string | null;
  created_at: TimestampText;
  updated_at: TimestampText;
};

export type MediaStreamInfoTable = {
  id: string;
  media_file_id: string;
  stream_index: number;
  stream_type: MediaStreamType;
  codec_name: string | null;
  codec_long_name: string | null;
  language: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  channels: number | null;
  sample_rate: number | null;
  duration_seconds: number | null;
  bit_rate: number | null;
  raw_json: JsonText;
  created_at: TimestampText;
  updated_at: TimestampText;
};
