import { apiErrorFrom, requireJsonAdmin } from "#lib/server/api.js";
import { apiJson } from "#lib/server/api/json.js";
import type { ScanStartResponse } from "#lib/server/api/types.js";
import { startScan } from "#lib/server/scanner/scan-jobs.js";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    return apiJson<ScanStartResponse>(await startScan(params.id), { status: 202 });
  } catch (error) {
    return apiErrorFrom(error, "Could not start scan.");
  }
};
