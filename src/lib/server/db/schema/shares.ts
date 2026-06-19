import type { NullableText, TimestampText } from "./common";
import type { MediaKind } from "./media";

export type MediaShareKind = Extract<MediaKind, "movie" | "show">;

export type MediaShareTable = {
  id: string;
  token: string;
  created_by_user_id: string;
  kind: MediaShareKind;
  media_item_id: string;
  season_ids: NullableText;
  expires_at: TimestampText;
  revoked_at: NullableText;
  created_at: TimestampText;
};
