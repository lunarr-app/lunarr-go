import { requireJsonAdmin } from "$lib/server/api";
import { listScanErrorsForJob, SCAN_ERROR_PER_JOB_LIMIT } from "$lib/server/jobs";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const errors = await listScanErrorsForJob(params.id);

  return json({
    errors,
    limit: SCAN_ERROR_PER_JOB_LIMIT,
  });
};
