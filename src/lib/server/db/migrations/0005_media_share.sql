create table media_share (
  id text primary key,
  token text not null unique,
  created_by_user_id text not null references user(id) on delete cascade,
  kind text not null check (kind in ('movie', 'show')),
  media_item_id text not null references media_item(id) on delete cascade,
  season_ids text,
  expires_at text not null,
  revoked_at text,
  created_at text not null
);

create index media_share_token_idx on media_share (token);
create index media_share_created_by_user_id_idx on media_share (created_by_user_id);
create index media_share_media_item_id_idx on media_share (media_item_id);
