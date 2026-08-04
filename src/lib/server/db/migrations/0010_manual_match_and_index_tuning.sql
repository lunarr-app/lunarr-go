-- Adds the manual match flag for admin "Fix Match" overrides, plus index
-- tuning: missing FK/lookup indexes are added and redundant ones dropped.

alter table media_item add column manual_match integer not null default 0;

create index if not exists scan_job_error_job_idx on scan_job_error(scan_job_id);
create index if not exists watchlist_media_item_idx on watchlist(media_item_id);
create index if not exists playback_session_cache_idx
  on playback_session(cache_id) where cache_id is not null;

-- Recommended by the better-auth performance guide: sessions.userId,
-- accounts.userId and verifications.identifier. Token and email are
-- already covered by unique constraints.
create index if not exists session_user_id_idx on session(user_id);
create index if not exists account_user_id_idx on account(user_id);
create index if not exists verification_identifier_idx on verification(identifier);

-- Redundant: duplicates the unique (media_file_id, stream_index) constraint.
drop index if exists media_stream_info_file_idx;
-- Redundant: duplicates the unique token constraint.
drop index if exists media_share_token_idx;
-- Redundant: duplicate the unique user_code/device_code constraints.
drop index if exists device_pairing_user_code_idx;
drop index if exists device_pairing_device_code_idx;
-- Redundant: prefix of subtitle_track_item_source_file_idx.
drop index if exists subtitle_track_item_idx;
-- Redundant: subsumed by media_item_episode_lookup_idx (kind, parent_id,
-- season_number, episode_number) and every lookup also filters on kind.
drop index if exists media_item_episode_order_idx;
-- Redundant: no query filters on job or credit name without media_item_id,
-- which the primary key prefix already covers.
drop index if exists media_item_credit_job_idx;
drop index if exists media_item_credit_name_idx;
-- Redundant: media_item_video is never read, only rewritten on metadata sync.
drop index if exists media_item_video_type_idx;
-- Redundant: nothing filters on release_date/popularity and all sorts on
-- these columns happen after GROUP BY/joins, so the indexes cannot serve them.
drop index if exists media_item_release_idx;
drop index if exists media_item_popularity_idx;
