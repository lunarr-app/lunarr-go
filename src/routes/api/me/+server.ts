import { requireJsonUser } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { MeResponse } from "$lib/server/api/types";
import { getContinueMaxAgeDays } from "$lib/server/media/continue-max-age";
import { getTranscodePolicy } from "$lib/server/transcoding/policy";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  return apiJson<MeResponse>({
    user,
    transcodePolicy: await getTranscodePolicy(user.id),
    continueMaxAgeDays: await getContinueMaxAgeDays(user.id),
  });
};
