import { approveDevicePairing, devicePairingHttpStatus } from "$lib/server/auth/device-pairing";
import {
  DEVICE_PAIRING_RATE_LIMIT_MESSAGE,
  isDevicePairingRateLimited,
} from "$lib/server/auth/device-pairing-rate-limit";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw error(401, "Unauthorized");

  const initialUserCode = url.searchParams.get("code")?.trim() ?? "";
  return { initialUserCode };
};

export const actions: Actions = {
  approveDevicePairing: async ({ request, locals, getClientAddress }) => {
    if (!locals.user) {
      return fail(401, {
        pairingError: "Sign in to link a device.",
      });
    }

    if (isDevicePairingRateLimited(getClientAddress() || "unknown", "device-pairing:approve")) {
      return fail(429, {
        pairingError: DEVICE_PAIRING_RATE_LIMIT_MESSAGE,
      });
    }

    const form = await request.formData();
    const userCode = String(form.get("userCode") ?? "");
    const deviceName = String(form.get("deviceName") ?? "").trim();

    try {
      const result = await approveDevicePairing({
        userId: locals.user.id,
        userCode,
        deviceName: deviceName || undefined,
      });

      return {
        pairingSuccess: `Linked ${result.deviceName}. The device can finish signing in now.`,
      };
    } catch (pairingError) {
      return fail(devicePairingHttpStatus(pairingError), {
        pairingError: pairingError instanceof Error ? pairingError.message : "Could not link device.",
      });
    }
  },
};
