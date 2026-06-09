import type { ColumnType } from "kysely";
import type { TimestampText } from "./common";

export type LibraryKind = "movie" | "tv";
export type LibrarySource = "local" | "sftp";
export type LibraryAccessMode = "all" | "shared";

export type LibraryTable = {
  id: string;
  name: string;
  kind: LibraryKind;
  source: ColumnType<LibrarySource, LibrarySource | undefined, LibrarySource | undefined>;
  access_mode: ColumnType<LibraryAccessMode, LibraryAccessMode | undefined, LibraryAccessMode | undefined>;
  path: string;
  config_json: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  created_at: TimestampText;
  updated_at: TimestampText;
};

export type LibraryUserTable = {
  library_id: string;
  user_id: string;
  created_at: TimestampText;
};
