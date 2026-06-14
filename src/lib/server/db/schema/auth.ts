import type { ColumnType } from "kysely";
import type { TimestampMs, TimestampStorage, TimestampText } from "./common";

export type UserTable = {
  id: string;
  name: string;
  email: string;
  role: ColumnType<string, string | undefined, string | undefined>;
  email_verified: ColumnType<boolean, boolean | number, boolean | number>;
  image: string | null;
  created_at: TimestampMs;
  updated_at: TimestampMs;
};

export type SessionTable = {
  id: string;
  token: string;
  user_id: string;
  expires_at: TimestampMs;
  ip_address: string | null;
  user_agent: string | null;
  created_at: TimestampMs;
  updated_at: TimestampMs;
};

export type AccountTable = {
  id: string;
  account_id: string;
  provider_id: string;
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  access_token_expires_at: TimestampMs | null;
  refresh_token_expires_at: TimestampMs | null;
  scope: string | null;
  password: string | null;
  created_at: TimestampMs;
  updated_at: TimestampMs;
};

export type VerificationTable = {
  id: string;
  identifier: string;
  value: string;
  expires_at: TimestampMs;
  created_at: TimestampMs;
  updated_at: TimestampMs;
};

export type AppSettingTable = {
  key: string;
  value: string;
  updated_at: TimestampText;
};

export type ApiKeyTable = {
  id: string;
  config_id: ColumnType<string, string | undefined, string | undefined>;
  name: string | null;
  start: string | null;
  prefix: string | null;
  key: string;
  reference_id: string;
  refill_interval: number | null;
  refill_amount: number | null;
  last_refill_at: TimestampMs | null;
  enabled: ColumnType<
    boolean,
    boolean | number | undefined,
    boolean | number | undefined
  >;
  rate_limit_enabled: ColumnType<
    boolean,
    boolean | number | undefined,
    boolean | number | undefined
  >;
  rate_limit_time_window: number | null;
  rate_limit_max: number | null;
  request_count: ColumnType<number, number | undefined, number | undefined>;
  remaining: number | null;
  last_request: TimestampMs | null;
  expires_at: TimestampStorage | null;
  created_at: TimestampMs;
  updated_at: TimestampMs;
  permissions: string | null;
  metadata: string | null;
};
