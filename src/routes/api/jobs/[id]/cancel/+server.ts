import { apiError, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse } from "$lib/server/api/types";
import { requireJsonAdmin } from "$lib/server/api";
import { cancelScanJob } from "$lib/server/scanner";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const result = await cancelScanJob(params.id);
  if (result === "missing") return apiError("Scan job was not found.", 404);
  if (result === "inactive") return apiError("Scan job is not active.");

  return apiJson<ApiOkResponse>({ ok: true });
};
