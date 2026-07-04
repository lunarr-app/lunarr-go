create table device_pairing (
  id text primary key,
  device_code text not null unique,
  user_code text not null unique,
  status text not null check (status in ('pending', 'approved', 'consumed', 'expired')),
  device_name text not null,
  approved_by_user_id text references user(id) on delete set null,
  api_key_id text,
  api_key_token text,
  expires_at text not null,
  approved_at text,
  created_at text not null
);

create index device_pairing_user_code_idx on device_pairing (user_code);
create index device_pairing_device_code_idx on device_pairing (device_code);
create index device_pairing_status_expires_at_idx on device_pairing (status, expires_at);
