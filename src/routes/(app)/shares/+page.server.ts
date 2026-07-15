import { fail } from "@sveltejs/kit";
import { requireAdmin } from "$lib/server/auth/users";
import { listAdminSharesPage, revokeShare as revokeShareRecord, shareListCounts } from "$lib/server/shares";
import type { Actions, PageServerLoad } from "./$types";

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

export const actions: Actions = {
  async revokeShare({ locals, request }) {
    requireAdmin(locals.user);

    const form = await request.formData();
    const shareId = form.get("shareId");
    if (typeof shareId !== "string" || !shareId) {
      return fail(400, { revokeError: "Missing share identifier." });
    }

    try {
      await revokeShareRecord({ shareId });
    } catch (revokeError) {
      return fail(400, {
        revokeError: revokeError instanceof Error ? revokeError.message : "Could not revoke share link.",
      });
    }

    return { revokeSuccess: true };
  },
};
