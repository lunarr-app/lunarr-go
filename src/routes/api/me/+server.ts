import { requireJsonUser } from "$lib/server/api";
import { getTranscodePolicy } from "$lib/server/transcoding/policy";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  return json({
    user,
    transcodePolicy: await getTranscodePolicy(user.id)
  });
};
