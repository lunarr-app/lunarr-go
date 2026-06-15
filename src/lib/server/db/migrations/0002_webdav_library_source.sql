pragma foreign_keys = off;

create table library_new (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('movie', 'tv')),
  source text not null default 'local' check (source in ('local', 'sftp', 'webdav')),
  access_mode text not null default 'all' check (access_mode in ('all', 'shared')),
  path text not null unique,
  config_json text,
  watch_enabled integer not null default 1,
  scan_interval_minutes integer,
  last_scheduled_scan_at text,
  created_at text not null,
  updated_at text not null
);

insert into library_new select * from library;

drop table library;

alter table library_new rename to library;

pragma foreign_keys = on;
