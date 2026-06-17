alter table user add column banned integer not null default 0;

alter table user add column ban_reason text;

alter table user add column ban_expires integer;

alter table session add column impersonated_by text;
