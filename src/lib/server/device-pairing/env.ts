import type { DevicePairingApiKeyExpirySettings } from "$lib/device-pairing/expiry-settings";
import { formatDevicePairingApiKeyExpiryLabel } from "$lib/device-pairing/expiry-label";
import { appEnv } from "$lib/server/config/env";

export type { DevicePairingApiKeyExpirySettings };

export function resolveDevicePairingApiKeyExpiresInSeconds(days: number): number | undefined {
  if (days === 0) return undefined;
  return days * 24 * 60 * 60;
}

export function resolveDevicePairingApiKeyExpirySettings(days: number): DevicePairingApiKeyExpirySettings {
  return {
    neverExpires: days === 0,
    label: days === 0 ? "" : formatDevicePairingApiKeyExpiryLabel(days),
  };
}

export function devicePairingApiKeyExpiresInSeconds(): number | undefined {
  return resolveDevicePairingApiKeyExpiresInSeconds(appEnv.LUNARR_DEVICE_PAIRING_API_KEY_EXPIRES_IN_DAYS);
}

export function devicePairingApiKeyExpirySettings(): DevicePairingApiKeyExpirySettings {
  return resolveDevicePairingApiKeyExpirySettings(appEnv.LUNARR_DEVICE_PAIRING_API_KEY_EXPIRES_IN_DAYS);
}
