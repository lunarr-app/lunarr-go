create table playback_hls_cache (
  id text primary key,
  media_file_id text not null references media_file(id) on delete cascade,
  mode text not null check (mode in ('remux', 'transcode')),
  policy_hash text not null,
  file_size_bytes integer not null,
  file_mtime_ms integer not null,
  artifact_dir text not null,
  furthest_segment_index integer,
  bytes integer not null default 0,
  ref_count integer not null default 0,
  last_access_at text not null,
  created_at text not null,
  updated_at text not null
);

create index playback_hls_cache_file_idx on playback_hls_cache(media_file_id);
create index playback_hls_cache_access_idx on playback_hls_cache(last_access_at);

alter table playback_session add column cache_id text references playback_hls_cache(id) on delete set null;
