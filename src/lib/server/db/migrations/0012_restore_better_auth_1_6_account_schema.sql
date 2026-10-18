-- Better Auth 1.7.3 restored the 1.6 account schema, which has no issuer column.
-- Migration 0011 added the column and a unique index for the 1.7.0-1.7.2
-- behaviour. Nothing reads or writes either now, so this drops both to match the
-- documented 1.6 schema again.
--
-- The values the column held were backfilled constants, not user data. Dropping
-- the index first keeps the column drop from failing on its unique constraint.
-- Requires SQLite 3.35 or newer for DROP COLUMN, verified on the bundled 3.45.1.

drop index if exists account_issuer_account_id_uidx;

alter table account drop column issuer;
