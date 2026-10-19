import { apiErrorFrom, requireJsonAdmin } from "#lib/server/api.js";
import { apiJson } from "#lib/server/api/json.js";
import type { JobsResponse } from "#lib/server/api/types.js";
import {
  getPlaybackSessionSummary,
  getScanJobSummary,
  listPlaybackSessions,
  listScanJobs,
} from "#lib/server/jobs/index.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const jobs = await listScanJobs();
    const playbackSessions = await listPlaybackSessions();

    return apiJson<JobsResponse>({
      summary: await getScanJobSummary(),
      playbackSessionSummary: await getPlaybackSessionSummary(),
      playbackSessions,
      jobs,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not load jobs.", 500);
  }
};
