import { apiErrorFrom, readJsonBody, requireJsonAdmin } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { ShareCreateResponse, SharesListResponse } from "$lib/server/api/types";
import { createShare, listAllShares, listSharesForMedia, parseCreateShareInput } from "$lib/server/shares";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const mediaItemId = url.searchParams.get("mediaItemId")?.trim() ?? "";
  if (!mediaItemId) {
    try {
      return apiJson<SharesListResponse>({
        shares: await listAllShares(),
      });
    } catch (error) {
      return apiErrorFrom(error, "Could not list shares.");
    }
  }

  try {
    return apiJson<SharesListResponse>({
      shares: await listSharesForMedia(mediaItemId),
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not list shares.");
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
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
