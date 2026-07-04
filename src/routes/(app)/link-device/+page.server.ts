import { DEVICE_PAIRING_USER_CODE_QUERY_PARAM } from "$lib/device-pairing/constants";
import { handleApproveDevicePairingForm } from "$lib/server/auth/device-pairing-form";
import { error } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw error(401, "Unauthorized");

  const initialUserCode = url.searchParams.get(DEVICE_PAIRING_USER_CODE_QUERY_PARAM)?.trim() ?? "";
  return { initialUserCode };
};

export const actions: Actions = {
  approveDevicePairing: handleApproveDevicePairingForm,
};
