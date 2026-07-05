import { formatDevicePairingApiKeyExpiryLabel } from "$lib/device-pairing/expiry-label";
import { appEnv } from "$lib/server/config/env";

export function resolveDevicePairingApiKeyExpiresInSeconds(days: number): number | undefined {
  if (days === 0) return undefined;
  return days * 24 * 60 * 60;
}

export function resolveDevicePairingApiKeyExpiryLabel(days: number): string {
  if (days === 0) return "never";
  return formatDevicePairingApiKeyExpiryLabel(days);
}

export function devicePairingApiKeyExpiresInSeconds(): number | undefined {
  return resolveDevicePairingApiKeyExpiresInSeconds(appEnv.LUNARR_DEVICE_PAIRING_API_KEY_EXPIRES_IN_DAYS);
}

export function devicePairingApiKeyExpiryLabel(): string {
  return resolveDevicePairingApiKeyExpiryLabel(appEnv.LUNARR_DEVICE_PAIRING_API_KEY_EXPIRES_IN_DAYS);
}
