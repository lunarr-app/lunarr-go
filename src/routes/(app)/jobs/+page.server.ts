import { requireAdmin } from "$lib/server/auth/users";
import {
  getScanJobSummary,
  getPlaybackSessionSummary,
  listScanJobs,
  listPlaybackSessions,
  PLAYBACK_SESSION_LIST_LIMIT,
  SCAN_JOB_LIST_LIMIT,
} from "$lib/server/jobs";
import { cancelScanJob } from "$lib/server/scanner/scan-jobs";
import { cancelPlaybackSession as stopPlaybackSession } from "$lib/server/transcoding/manager";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const jobs = await listScanJobs();
  const playbackSessions = await listPlaybackSessions();

  return {
    summary: await getScanJobSummary(),
    playbackSessionSummary: await getPlaybackSessionSummary(),
    jobs,
    playbackSessions,
    scanJobListLimit: SCAN_JOB_LIST_LIMIT,
    playbackSessionListLimit: PLAYBACK_SESSION_LIST_LIMIT,
  };
};

export const actions: Actions = {
  cancel: async ({ request, locals }) => {
    requireAdmin(locals.user);
    const form = await request.formData();
    const jobId = String(form.get("jobId") ?? "");
    if (!jobId) return fail(400, { jobActionError: "Scan job is required." });

    const result = await cancelScanJob(jobId);
    if (result === "missing") return fail(404, { jobActionError: "Scan job was not found." });
    if (result === "inactive") return fail(400, { jobActionError: "Scan job is not active." });

    throw redirect(303, "/jobs");
  },

  cancelPlaybackSession: async ({ request, locals }) => {
    requireAdmin(locals.user);
    const form = await request.formData();
    const sessionId = String(form.get("sessionId") ?? "");
    if (!sessionId) return fail(400, { jobActionError: "Playback session is required." });

    const result = await stopPlaybackSession(sessionId);
    if (result === "missing") return fail(404, { jobActionError: "Playback session was not found." });
    if (result === "inactive") return fail(400, { jobActionError: "Playback session is not active." });

    throw redirect(303, "/jobs");
  },
};
