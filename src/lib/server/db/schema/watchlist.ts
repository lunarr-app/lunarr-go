import type { TimestampText } from "./common";

export type WatchlistTable = {
  user_id: string;
  media_item_id: string;
  created_at: TimestampText;
};
