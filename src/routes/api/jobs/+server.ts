import { isAdmin } from "$lib/server/auth/users";
import { apiError, apiJson } from "$lib/server/api/json";
import type { JobsResponse } from "$lib/server/api/types";
import { getPlaybackSessionSummary, getScanJobSummary, listPlaybackSessions, listScanJobs } from "$lib/server/jobs";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return apiError("Unauthorized", 401);
  }

  if (!isAdmin(locals.user)) {
    return apiError("Admin access required", 403);
  }

  const jobs = await listScanJobs();
  const playbackSessions = await listPlaybackSessions();

  return apiJson<JobsResponse>({
    summary: await getScanJobSummary(),
    playbackSessionSummary: await getPlaybackSessionSummary(),
    playbackSessions,
    jobs,
  });
};
