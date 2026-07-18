create table watchlist (
  user_id text not null references user(id) on delete cascade,
  media_item_id text not null references media_item(id) on delete cascade,
  created_at text not null,
  primary key (user_id, media_item_id)
);
