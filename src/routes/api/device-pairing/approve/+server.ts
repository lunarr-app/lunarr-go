import { parseBody, requireJsonUser } from "$lib/server/api";
import { apiError, apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { DevicePairingApproveResponse } from "$lib/server/api/types";
import { approveDevicePairing, devicePairingHttpStatus } from "$lib/server/auth/device-pairing";
import { enforceDevicePairingRateLimit } from "$lib/server/auth/device-pairing-rate-limit";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const devicePairingApproveSchema = z.object({
  userCode: z.unknown(),
  deviceName: z.unknown().optional(),
});

export const POST: RequestHandler = async (event) => {
  const user = requireJsonUser(event.locals);
  if (user instanceof Response) return user;

  const rateLimited = enforceDevicePairingRateLimit(event, "device-pairing:approve");
  if (rateLimited) return rateLimited;

  try {
    const body = await parseBody(event.request, devicePairingApproveSchema);
    if (!body.userCode) {
      return apiError("Pairing code is required.", 400);
    }

    return apiJson<DevicePairingApproveResponse>(
      await approveDevicePairing({
        userId: user.id,
        userCode: body.userCode,
        deviceName: body.deviceName,
      }),
    );
  } catch (error) {
    return apiErrorFrom(error, "Could not approve device pairing.", devicePairingHttpStatus(error));
  }
};
