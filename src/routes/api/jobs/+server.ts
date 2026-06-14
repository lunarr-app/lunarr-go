import { isAdmin } from "$lib/server/auth/users";
import {
  getPlaybackSessionSummary,
  getScanJobSummary,
  listPlaybackSessions,
  listScanErrors,
  listScanJobs,
} from "$lib/server/jobs";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(locals.user)) {
    return json({ error: "Admin access required" }, { status: 403 });
  }

  return json({
    summary: await getScanJobSummary(),
    playbackSessionSummary: await getPlaybackSessionSummary(),
    playbackSessions: await listPlaybackSessions(),
    jobs: await listScanJobs(),
    errors: await listScanErrors(),
  });
};
