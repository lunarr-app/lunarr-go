import {
  formatDevicePairingApiKeyExpiryLabel,
  type DevicePairingApiKeyExpirySettings,
} from "$lib/device-pairing/expiry-label";
import { appEnv } from "$lib/server/config/env";

export function devicePairingApiKeyExpiresInSeconds(
  days = appEnv.LUNARR_DEVICE_PAIRING_API_KEY_EXPIRES_IN_DAYS,
): number | undefined {
  if (days === 0) return undefined;
  return days * 24 * 60 * 60;
}

export function devicePairingApiKeyExpirySettings(
  days = appEnv.LUNARR_DEVICE_PAIRING_API_KEY_EXPIRES_IN_DAYS,
): DevicePairingApiKeyExpirySettings {
  return {
    neverExpires: days === 0,
    label: days === 0 ? "" : formatDevicePairingApiKeyExpiryLabel(days),
  };
}
