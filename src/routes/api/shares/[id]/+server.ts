import { jsonError, requireJsonAdmin } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { ShareRevokeResponse } from "$lib/server/api/types";
import { revokeShare } from "$lib/server/shares";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const share = await revokeShare({ shareId: params.id });
    return apiJson<ShareRevokeResponse>({ share });
  } catch (error) {
    return jsonError(
      error,
      "Could not revoke share.",
      error instanceof Error && error.message === "Share not found." ? 404 : 400,
    );
  }
};
