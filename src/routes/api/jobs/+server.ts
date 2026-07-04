import { apiJson } from "$lib/server/api/json";
import type { JobsResponse } from "$lib/server/api/types";
import { requireJsonAdmin } from "$lib/server/api";
import { getPlaybackSessionSummary, getScanJobSummary, listPlaybackSessions, listScanJobs } from "$lib/server/jobs";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const jobs = await listScanJobs();
  const playbackSessions = await listPlaybackSessions();

  return apiJson<JobsResponse>({
    summary: await getScanJobSummary(),
    playbackSessionSummary: await getPlaybackSessionSummary(),
    playbackSessions,
    jobs,
  });
};
