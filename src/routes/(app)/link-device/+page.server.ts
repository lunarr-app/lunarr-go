import { readLinkDevicePrefill } from "$lib/device-pairing/url";
import { handleApproveDevicePairingForm } from "$lib/server/auth/device-pairing-form";
import { error } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw error(401, "Unauthorized");

  const { initialUserCode, initialDeviceName } = readLinkDevicePrefill(url);
  return { initialUserCode, initialDeviceName };
};

export const actions: Actions = {
  approveDevicePairing: handleApproveDevicePairingForm,
};
