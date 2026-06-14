import type {
  AccountTable,
  ApiKeyTable,
  AppSettingTable,
  SessionTable,
  UserTable,
  VerificationTable,
} from "./schema/auth";
import type { LibraryTable, LibraryUserTable } from "./schema/library";
import type {
  MediaFileTable,
  MediaItemCreditTable,
  MediaItemGenreTable,
  MediaItemKeywordTable,
  MediaItemProductionCompanyTable,
  MediaItemProductionCountryTable,
  MediaItemSpokenLanguageTable,
  MediaItemTable,
  MediaItemVideoTable,
  SubtitleTrackTable,
} from "./schema/media";
import type { WatchProgressTable } from "./schema/playback";
import type { ScanJobErrorTable, ScanJobTable } from "./schema/scanner";
import type { MediaStreamInfoTable, PlaybackSessionTable, PlaybackHlsArtifactTable } from "./schema/streaming";

export type * from "./schema/auth";
export type * from "./schema/common";
export type * from "./schema/library";
export type * from "./schema/media";
export type * from "./schema/playback";
export type * from "./schema/scanner";
export type * from "./schema/streaming";

export type Database = {
  user: UserTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
  app_setting: AppSettingTable;
  apikey: ApiKeyTable;
  library: LibraryTable;
  library_user: LibraryUserTable;
  media_item: MediaItemTable;
  media_item_genre: MediaItemGenreTable;
  media_item_credit: MediaItemCreditTable;
  media_item_video: MediaItemVideoTable;
  media_item_keyword: MediaItemKeywordTable;
  media_item_production_company: MediaItemProductionCompanyTable;
  media_item_production_country: MediaItemProductionCountryTable;
  media_item_spoken_language: MediaItemSpokenLanguageTable;
  media_file: MediaFileTable;
  subtitle_track: SubtitleTrackTable;
  watch_progress: WatchProgressTable;
  scan_job: ScanJobTable;
  scan_job_error: ScanJobErrorTable;
  playback_session: PlaybackSessionTable;
  playback_hls_artifact: PlaybackHlsArtifactTable;
  media_stream_info: MediaStreamInfoTable;
};
