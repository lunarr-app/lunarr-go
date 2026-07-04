import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { DevicePairingPollResponse } from "$lib/server/api/types";
import { devicePairingHttpStatus, pollDevicePairing } from "$lib/server/auth/device-pairing";
import { enforceDevicePairingRateLimit } from "$lib/server/auth/device-pairing-rate-limit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const deviceCode = event.url.searchParams.get("deviceCode")?.trim() ?? "";
  const rateLimited = enforceDevicePairingRateLimit(event, "device-pairing:poll", deviceCode || "missing");
  if (rateLimited) return rateLimited;

  try {
    return apiJson<DevicePairingPollResponse>(await pollDevicePairing(deviceCode));
  } catch (error) {
    return apiErrorFrom(error, "Could not poll device pairing.", devicePairingHttpStatus(error));
  }
};
