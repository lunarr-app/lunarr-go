import { readLinkDevicePrefill } from "#lib/device-pairing/url.js";
import { handleApproveDevicePairingForm } from "#lib/server/auth/device-pairing-form.js";
import { devicePairingApiKeyExpirySettings } from "#lib/server/device-pairing/env.js";
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
