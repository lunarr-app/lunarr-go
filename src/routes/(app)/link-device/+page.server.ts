import { readLinkDevicePrefill } from "$lib/device-pairing/url";
import { handleApproveDevicePairingForm } from "$lib/server/auth/device-pairing-form";
import { devicePairingApiKeyExpirySettings } from "$lib/server/device-pairing/env";
import { error } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw error(401, "Unauthorized");

  const { initialUserCode, initialDeviceName } = readLinkDevicePrefill(url);
  return {
    initialUserCode,
    initialDeviceName,
    devicePairingApiKeyExpiry: devicePairingApiKeyExpirySettings(),
  };
};

export const actions: Actions = {
  approveDevicePairing: handleApproveDevicePairingForm,
};
