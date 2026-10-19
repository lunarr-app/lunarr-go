import { apiError, apiJson } from "#lib/server/api/json.js";
import type { ApiOkResponse } from "#lib/server/api/types.js";
import { requireJsonAdmin } from "#lib/server/api.js";
import { cancelScanJob } from "#lib/server/scanner/scan-jobs.js";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const result = await cancelScanJob(params.id);
  if (result === "missing") return apiError("Scan job was not found.", 404);
  if (result === "inactive") return apiError("Scan job is not active.");

  return apiJson<ApiOkResponse>({ ok: true });
};
