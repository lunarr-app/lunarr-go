import type { ColumnType } from "kysely";
import type { TimestampText } from "./common";

export type WatchProgressTable = {
  user_id: string;
  media_item_id: string;
  media_file_id: string;
  position_seconds: number;
  duration_seconds: number | null;
  completed: ColumnType<boolean, boolean | number, boolean | number>;
  updated_at: TimestampText;
};
