import type { ColumnType, Generated } from "kysely";
import type { TimestampText } from "./common";

export type ScanJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type ScanJobKind = "library_scan" | "movie_metadata_refresh" | "tv_metadata_refresh" | "media_probe_refresh";

export type ScanJobTable = {
  id: string;
  job_kind: ColumnType<ScanJobKind, ScanJobKind | undefined, ScanJobKind>;
  library_id: string | null;
  status: ScanJobStatus;
  started_at: string | null;
  finished_at: string | null;
  files_seen: number;
  files_added: number;
  files_updated: number;
  files_removed: ColumnType<number, number | undefined, number>;
  errors_count: number;
  cancel_requested_at: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  rescan_requested_at: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  checkpoint_value: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  runner_token: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  runner_heartbeat_at: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  created_at: TimestampText;
  updated_at: TimestampText;
};

export type ScanJobErrorTable = {
  id: Generated<number>;
  scan_job_id: string;
  path: string;
  message: string;
  created_at: TimestampText;
};
