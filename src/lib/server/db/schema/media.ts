import type { ColumnType } from "kysely";
import type { NullableNumber, NullableText, TimestampText } from "./common";

export type MediaKind = "movie" | "show" | "season" | "episode";
export type SubtitleSourceKind = "external" | "embedded";

export type MediaItemTable = {
  id: string;
  kind: MediaKind;
  title: string;
  sort_title: string;
  original_title: NullableText;
  year: NullableNumber;
  season_number: NullableNumber;
  episode_number: NullableNumber;
  overview: NullableText;
  tagline: NullableText;
  runtime_seconds: NullableNumber;
  poster_path: NullableText;
  backdrop_path: NullableText;
  release_date: NullableText;
  status: NullableText;
  homepage: NullableText;
  original_language: NullableText;
  imdb_id: NullableText;
  budget: NullableNumber;
  revenue: NullableNumber;
  vote_count: NullableNumber;
  certification: NullableText;
  trailer_site: NullableText;
  trailer_key: NullableText;
  trailer_name: NullableText;
  collection_provider_id: NullableText;
  collection_name: NullableText;
  collection_poster_path: NullableText;
  collection_backdrop_path: NullableText;
  provider: NullableText;
  provider_id: NullableText;
  parent_id: NullableText;
  popularity: NullableNumber;
  vote_average: NullableNumber;
  created_at: TimestampText;
  updated_at: TimestampText;
};

export type MediaItemGenreTable = {
  media_item_id: string;
  provider: string;
  provider_id: string;
  name: string;
  position: number;
};

export type MediaItemCreditTable = {
  media_item_id: string;
  credit_type: "cast" | "crew";
  provider: string;
  provider_id: string;
  credit_id: ColumnType<string, string | undefined, string>;
  name: string;
  original_name: string | null;
  profile_path: string | null;
  credit_order: number;
  department: string | null;
  job: string | null;
  character_name: string | null;
};

export type MediaItemVideoTable = {
  media_item_id: string;
  provider: string;
  provider_id: string;
  name: string;
  site: string;
  video_key: string;
  video_type: string | null;
  official: ColumnType<boolean, boolean | number, boolean | number>;
  published_at: string | null;
};

export type MediaItemKeywordTable = {
  media_item_id: string;
  provider: string;
  provider_id: string;
  name: string;
};

export type MediaItemProductionCompanyTable = {
  media_item_id: string;
  provider: string;
  provider_id: string;
  name: string;
  logo_path: string | null;
  origin_country: string | null;
};

export type MediaItemProductionCountryTable = {
  media_item_id: string;
  iso_3166_1: string;
  name: string;
};

export type MediaItemSpokenLanguageTable = {
  media_item_id: string;
  iso_639_1: string;
  english_name: string | null;
  name: string;
};

export type MediaFileTable = {
  id: string;
  library_id: string;
  media_item_id: string;
  path: string;
  basename: string;
  extension: string;
  size_bytes: number;
  mtime_ms: number;
  duration_seconds: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  container: string | null;
  created_at: TimestampText;
  updated_at: TimestampText;
};

export type SubtitleTrackTable = {
  id: string;
  media_item_id: string;
  media_file_id: string | null;
  label: string;
  language: string;
  source_kind: SubtitleSourceKind;
  path: string | null;
  mime_type: string | null;
  is_default: ColumnType<boolean, boolean | number, boolean | number>;
  created_at: TimestampText;
  updated_at: TimestampText;
};
