create table user (
  id text primary key,
  name text not null,
  email text not null unique,
  email_verified integer not null default 0,
  image text,
  role text not null default 'user',
  created_at integer not null,
  updated_at integer not null
);

create table session (
  id text primary key,
  token text not null unique,
  user_id text not null references user(id) on delete cascade,
  expires_at integer not null,
  ip_address text,
  user_agent text,
  created_at integer not null,
  updated_at integer not null
);

create table account (
  id text primary key,
  account_id text not null,
  provider_id text not null,
  user_id text not null references user(id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at integer,
  refresh_token_expires_at integer,
  scope text,
  password text,
  created_at integer not null,
  updated_at integer not null
);

create table verification (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at integer not null,
  created_at integer not null,
  updated_at integer not null
);

create table app_setting (
  key text primary key,
  value text not null,
  updated_at text not null
);

create table apikey (
  id text primary key,
  config_id text not null default 'default',
  name text,
  start text,
  prefix text,
  key text not null,
  reference_id text not null references user(id) on delete cascade,
  refill_interval integer,
  refill_amount integer,
  last_refill_at integer,
  enabled integer default 1,
  rate_limit_enabled integer default 0,
  rate_limit_time_window integer,
  rate_limit_max integer,
  request_count integer default 0,
  remaining integer,
  last_request integer,
  expires_at integer,
  created_at integer not null,
  updated_at integer not null,
  permissions text,
  metadata text
);

create index apikey_config_id_idx on apikey(config_id);
create index apikey_key_idx on apikey(key);
create index apikey_reference_id_idx on apikey(reference_id);

create table library (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('movie', 'tv')),
  source text not null default 'local' check (source in ('local', 'sftp')),
  access_mode text not null default 'all' check (access_mode in ('all', 'shared')),
  path text not null unique,
  config_json text,
  created_at text not null,
  updated_at text not null
);

create table library_user (
  library_id text not null references library(id) on delete cascade,
  user_id text not null references user(id) on delete cascade,
  created_at text not null,
  primary key (library_id, user_id)
);

create index library_user_user_idx on library_user(user_id);

create table media_item (
  id text primary key,
  kind text not null check (kind in ('movie', 'show', 'season', 'episode')),
  title text not null,
  sort_title text not null,
  original_title text,
  year integer,
  season_number integer,
  episode_number integer,
  overview text,
  tagline text,
  runtime_seconds integer,
  poster_path text,
  backdrop_path text,
  release_date text,
  status text,
  homepage text,
  original_language text,
  imdb_id text,
  budget integer,
  revenue integer,
  vote_count integer,
  certification text,
  trailer_site text,
  trailer_key text,
  trailer_name text,
  collection_provider_id text,
  collection_name text,
  collection_poster_path text,
  collection_backdrop_path text,
  provider text,
  provider_id text,
  parent_id text references media_item(id) on delete set null,
  popularity real,
  vote_average real,
  created_at text not null,
  updated_at text not null
);

create unique index media_item_provider_kind_unique on media_item(kind, provider, provider_id) where provider is not null and provider_id is not null;
create index media_item_kind_sort_idx on media_item(kind, sort_title);
create index media_item_parent_kind_idx on media_item(parent_id, kind);
create index media_item_episode_order_idx on media_item(parent_id, season_number, episode_number);
create index media_item_release_idx on media_item(release_date);
create index media_item_popularity_idx on media_item(popularity);

create table media_item_genre (
  media_item_id text not null references media_item(id) on delete cascade,
  provider text not null,
  provider_id text not null,
  name text not null,
  position integer not null default 0,
  primary key (media_item_id, provider, provider_id)
);

create index media_item_genre_name_idx on media_item_genre(name);

create table media_item_credit (
  media_item_id text not null references media_item(id) on delete cascade,
  credit_type text not null check (credit_type in ('cast', 'crew')),
  provider text not null,
  provider_id text not null,
  credit_id text not null default '',
  name text not null,
  original_name text,
  profile_path text,
  credit_order integer not null default 0,
  department text,
  job text,
  character_name text,
  primary key (media_item_id, credit_type, provider, provider_id, credit_id)
);

create index media_item_credit_person_idx on media_item_credit(provider, provider_id);
create index media_item_credit_name_idx on media_item_credit(name);
create index media_item_credit_job_idx on media_item_credit(job);

create table media_item_video (
  media_item_id text not null references media_item(id) on delete cascade,
  provider text not null,
  provider_id text not null,
  name text not null,
  site text not null,
  video_key text not null,
  video_type text,
  official integer not null default 0,
  published_at text,
  primary key (media_item_id, provider, provider_id)
);

create index media_item_video_type_idx on media_item_video(video_type, site);

create table media_item_keyword (
  media_item_id text not null references media_item(id) on delete cascade,
  provider text not null,
  provider_id text not null,
  name text not null,
  primary key (media_item_id, provider, provider_id)
);

create index media_item_keyword_name_idx on media_item_keyword(name);

create table media_item_production_company (
  media_item_id text not null references media_item(id) on delete cascade,
  provider text not null,
  provider_id text not null,
  name text not null,
  logo_path text,
  origin_country text,
  primary key (media_item_id, provider, provider_id)
);

create table media_item_production_country (
  media_item_id text not null references media_item(id) on delete cascade,
  iso_3166_1 text not null,
  name text not null,
  primary key (media_item_id, iso_3166_1)
);

create table media_item_spoken_language (
  media_item_id text not null references media_item(id) on delete cascade,
  iso_639_1 text not null,
  english_name text,
  name text not null,
  primary key (media_item_id, iso_639_1)
);

create table media_file (
  id text primary key,
  library_id text not null references library(id) on delete cascade,
  media_item_id text not null references media_item(id) on delete cascade,
  path text not null unique,
  basename text not null,
  extension text not null,
  size_bytes integer not null,
  mtime_ms integer not null,
  duration_seconds integer,
  video_codec text,
  audio_codec text,
  container text,
  created_at text not null,
  updated_at text not null
);

create index media_file_item_idx on media_file(media_item_id);
create index media_file_library_idx on media_file(library_id);

create table watch_progress (
  user_id text not null references user(id) on delete cascade,
  media_item_id text not null references media_item(id) on delete cascade,
  media_file_id text not null references media_file(id) on delete cascade,
  position_seconds real not null default 0,
  duration_seconds real,
  completed integer not null default 0,
  updated_at text not null,
  primary key (user_id, media_item_id, media_file_id)
);

create table subtitle_track (
  id text primary key,
  media_item_id text not null references media_item(id) on delete cascade,
  media_file_id text references media_file(id) on delete cascade,
  label text not null,
  language text not null,
  source_kind text not null check (source_kind in ('external', 'embedded')),
  path text,
  mime_type text,
  is_default integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create index subtitle_track_item_idx on subtitle_track(media_item_id);
create index subtitle_track_file_idx on subtitle_track(media_file_id);

create table scan_job (
  id text primary key,
  job_kind text not null default 'library_scan',
  library_id text references library(id) on delete set null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  started_at text,
  finished_at text,
  files_seen integer not null default 0,
  files_added integer not null default 0,
  files_updated integer not null default 0,
  files_removed integer not null default 0,
  errors_count integer not null default 0,
  cancel_requested_at text,
  rescan_requested_at text,
  checkpoint_value text,
  runner_token text,
  runner_heartbeat_at text,
  created_at text not null,
  updated_at text not null
);

create index scan_job_created_idx on scan_job(created_at);
create unique index scan_job_active_library_unique on scan_job(library_id) where library_id is not null and status in ('queued', 'running');
create unique index scan_job_active_movie_metadata_unique on scan_job(job_kind) where job_kind = 'movie_metadata_refresh' and status in ('queued', 'running');
create unique index scan_job_active_tv_metadata_unique on scan_job(job_kind) where job_kind = 'tv_metadata_refresh' and status in ('queued', 'running');
create unique index scan_job_active_media_probe_unique on scan_job(job_kind) where job_kind = 'media_probe_refresh' and status in ('queued', 'running');

create table scan_job_error (
  id integer primary key autoincrement,
  scan_job_id text not null references scan_job(id) on delete cascade,
  path text not null,
  message text not null,
  created_at text not null
);

create table playback_session (
  id text primary key,
  media_file_id text not null references media_file(id) on delete cascade,
  user_id text references user(id) on delete set null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  mode text not null check (mode in ('remux', 'transcode')),
  pipeline text check (pipeline in ('request_driven')),
  error_message text,
  last_heartbeat_at text,
  last_segment_request_at text,
  last_segment_name text,
  last_segment_index integer,
  start_time_seconds real not null default 0,
  started_at text,
  finished_at text,
  created_at text not null,
  updated_at text not null
);

create index playback_session_file_idx on playback_session(media_file_id);
create index playback_session_status_idx on playback_session(status, created_at);

create table playback_hls_artifact (
  id text primary key,
  playback_session_id text not null references playback_session(id) on delete cascade,
  media_file_id text not null references media_file(id) on delete cascade,
  path text not null,
  mime_type text,
  created_at text not null,
  updated_at text not null
);

create index playback_hls_artifact_session_idx on playback_hls_artifact(playback_session_id);
create index playback_hls_artifact_file_idx on playback_hls_artifact(media_file_id);

create table media_stream_info (
  id text primary key,
  media_file_id text not null references media_file(id) on delete cascade,
  stream_index integer not null,
  stream_type text not null check (stream_type in ('video', 'audio', 'subtitle', 'data')),
  codec_name text,
  codec_long_name text,
  language text,
  title text,
  width integer,
  height integer,
  channels integer,
  sample_rate integer,
  duration_seconds real,
  bit_rate integer,
  raw_json text,
  created_at text not null,
  updated_at text not null,
  unique (media_file_id, stream_index)
);

create index media_stream_info_file_idx on media_stream_info(media_file_id);
