import { apiErrorFrom, requireJsonAdmin } from "#lib/server/api.js";
import { apiJson } from "#lib/server/api/json.js";
import type { ShareRevokeResponse } from "#lib/server/api/types.js";
import { revokeShare } from "#lib/server/shares/index.js";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const share = await revokeShare({ shareId: params.id });
    return apiJson<ShareRevokeResponse>({ share });
  } catch (error) {
    return apiErrorFrom(
      error,
      "Could not revoke share.",
      error instanceof Error && error.message === "Share not found." ? 404 : 400,
    );
  }
};
