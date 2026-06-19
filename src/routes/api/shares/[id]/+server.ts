import { jsonError, requireJsonAdmin } from "$lib/server/api";
import { revokeShare } from "$lib/server/shares";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const share = await revokeShare({ shareId: params.id });
    return json({ share });
  } catch (error) {
    return jsonError(
      error,
      "Could not revoke share.",
      error instanceof Error && error.message === "Share not found." ? 404 : 400,
    );
  }
};
