import { readJsonBody, requireJsonUser } from "$lib/server/api";
import { apiError, apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { DevicePairingApproveResponse } from "$lib/server/api/types";
import { approveDevicePairing, devicePairingHttpStatus } from "$lib/server/auth/device-pairing";
import { enforceDevicePairingRateLimit } from "$lib/server/auth/device-pairing-rate-limit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const user = requireJsonUser(event.locals);
  if (user instanceof Response) return user;

  const rateLimited = enforceDevicePairingRateLimit(event, "device-pairing:approve");
  if (rateLimited) return rateLimited;

  try {
    const body = await readJsonBody(event.request);
    if (!body || typeof body !== "object" || !("userCode" in body)) {
      return apiError("Pairing code is required.", 400);
    }

    const payload = body as { userCode?: unknown; deviceName?: unknown };
    return apiJson<DevicePairingApproveResponse>(
      await approveDevicePairing({
        userId: user.id,
        userCode: payload.userCode,
        deviceName: payload.deviceName,
      }),
    );
  } catch (error) {
    return apiErrorFrom(error, "Could not approve device pairing.", devicePairingHttpStatus(error));
  }
};
