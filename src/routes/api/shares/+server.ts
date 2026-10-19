import { apiErrorFrom, parseBody, recordObjectSchema, requireJsonAdmin } from "#lib/server/api.js";
import { apiJson } from "#lib/server/api/json.js";
import type { AdminSharesListResponse, MediaSharesListResponse, ShareCreateResponse } from "#lib/server/api/types.js";
import { createShare, listAllShares, listSharesForMedia, parseCreateShareInput } from "#lib/server/shares/index.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const mediaItemId = url.searchParams.get("mediaItemId")?.trim() ?? "";
  if (!mediaItemId) {
    try {
      return apiJson<AdminSharesListResponse>({
        shares: await listAllShares(),
      });
    } catch (error) {
      return apiErrorFrom(error, "Could not list shares.", 500);
    }
  }

  try {
    return apiJson<MediaSharesListResponse>({
      shares: await listSharesForMedia(mediaItemId),
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not list shares.", 500);
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const body = await parseBody(request, recordObjectSchema);
    const input = parseCreateShareInput(body);
    const share = await createShare({
      userId: user.id,
      ...input,
    });
    return apiJson<ShareCreateResponse>({ share }, { status: 201 });
  } catch (error) {
    return apiErrorFrom(error, "Could not create share.");
  }
};
