import { readJsonBody } from "$lib/server/api";
import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { DevicePairingStartResponse } from "$lib/server/api/types";
import { devicePairingHttpStatus, startDevicePairing } from "$lib/server/auth/device-pairing";
import { enforceDevicePairingRateLimit } from "$lib/server/auth/device-pairing-rate-limit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const rateLimited = enforceDevicePairingRateLimit(event, "device-pairing:start");
  if (rateLimited) return rateLimited;

  try {
    const body = await readJsonBody(event.request).catch(() => null);
    const deviceName =
      typeof body === "object" && body && "deviceName" in body
        ? (body as { deviceName?: unknown }).deviceName
        : undefined;
    const trimmedDeviceName = typeof deviceName === "string" ? deviceName.trim() : "";

    return apiJson<DevicePairingStartResponse>(
      await startDevicePairing({
        origin: event.url.origin,
        deviceName: trimmedDeviceName || undefined,
      }),
      { status: 201 },
    );
  } catch (error) {
    return apiErrorFrom(error, "Could not start device pairing.", devicePairingHttpStatus(error));
  }
};
