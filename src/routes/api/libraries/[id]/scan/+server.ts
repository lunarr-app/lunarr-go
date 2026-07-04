import { jsonError, requireJsonAdmin } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { ScanStartResponse } from "$lib/server/api/types";
import { startScan } from "$lib/server/scanner";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    return apiJson<ScanStartResponse>(await startScan(params.id), { status: 202 });
  } catch (error) {
    return jsonError(error, "Could not start scan.");
  }
};
