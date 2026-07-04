import { fail } from "@sveltejs/kit";
import { approveDevicePairing, devicePairingHttpStatus } from "./device-pairing";
import { DEVICE_PAIRING_RATE_LIMIT_MESSAGE, isDevicePairingRateLimited } from "./device-pairing-rate-limit";

type ApproveDevicePairingFormInput = {
  request: Request;
  locals: { user?: { id: string } | null };
  getClientAddress: () => string;
};

export async function handleApproveDevicePairingForm(input: ApproveDevicePairingFormInput) {
  if (!input.locals.user) {
    return fail(401, {
      pairingError: "Sign in to link a device.",
    });
  }

  if (isDevicePairingRateLimited(input.getClientAddress() || "unknown", "device-pairing:approve")) {
    return fail(429, {
      pairingError: DEVICE_PAIRING_RATE_LIMIT_MESSAGE,
    });
  }

  const form = await input.request.formData();
  const userCode = String(form.get("userCode") ?? "");
  const deviceName = String(form.get("deviceName") ?? "").trim();

  try {
    const result = await approveDevicePairing({
      userId: input.locals.user.id,
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
}
