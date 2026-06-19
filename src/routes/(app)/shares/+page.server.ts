import { requireAdmin } from "$lib/server/auth/users";
import { listAllShares } from "$lib/server/shares";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  return {
    shares: await listAllShares(),
  };
};
