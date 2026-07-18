import { apiErrorFrom, requireJsonAdmin } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { JobErrorsResponse } from "$lib/server/api/types";
import { listScanErrorsForJob, SCAN_ERROR_PER_JOB_LIMIT } from "$lib/server/jobs";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const errors = await listScanErrorsForJob(params.id);

    return apiJson<JobErrorsResponse>({
      errors,
      limit: SCAN_ERROR_PER_JOB_LIMIT,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not load job errors.", 500);
  }
};
