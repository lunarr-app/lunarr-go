import type { NullableText, TimestampText } from "./common";

export type DevicePairingStatus = "pending" | "approved" | "consumed" | "expired";

export type DevicePairingTable = {
  id: string;
  device_code: string;
  user_code: string;
  status: DevicePairingStatus;
  device_name: string;
  approved_by_user_id: NullableText;
  api_key_id: NullableText;
  api_key_token: NullableText;
  expires_at: TimestampText;
  approved_at: NullableText;
  created_at: TimestampText;
};
