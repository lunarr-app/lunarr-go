import { requireAdmin } from "$lib/server/auth/users";
import { listAdminSharesPage, shareListCounts } from "$lib/server/shares";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals.user);

  const page = Number(url.searchParams.get("page") ?? "1");
  const status = url.searchParams.get("status");

  const [{ shares, page: pageInfo, status: activeStatus }, counts] = await Promise.all([
    listAdminSharesPage({ page, status }),
    shareListCounts(),
  ]);

  return {
    shares,
    page: pageInfo,
    status: activeStatus,
    counts,
  };
};
