import { readJsonBody } from "$lib/server/api";
import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { DevicePairingStartResponse } from "$lib/server/api/types";
import { devicePairingHttpStatus, startDevicePairing } from "$lib/server/auth/device-pairing";
import { enforceDevicePairingRateLimit } from "$lib/server/auth/device-pairing-rate-limit";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const devicePairingStartSchema = z
  .object({
    deviceName: z.unknown().optional(),
  })
  .nullable()
  .default({});

export const POST: RequestHandler = async (event) => {
  const rateLimited = enforceDevicePairingRateLimit(event, "device-pairing:start");
  if (rateLimited) return rateLimited;

  try {
    const raw = await readJsonBody(event.request).catch(() => null);
    const body = devicePairingStartSchema.parse(raw);
    const deviceName = body ? String(body.deviceName ?? "").trim() : "";

    return apiJson<DevicePairingStartResponse>(
      await startDevicePairing({
        origin: event.url.origin,
        deviceName: deviceName || undefined,
      }),
      { status: 201 },
    );
  } catch (error) {
    return apiErrorFrom(error, "Could not start device pairing.", devicePairingHttpStatus(error));
  }
};
