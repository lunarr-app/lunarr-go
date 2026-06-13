import {
  prepareRemotePlayback,
  RemotePlaybackRequestError,
  type RemotePlaybackRequest,
} from "$lib/server/playback/remote";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, url, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RemotePlaybackRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    return json(
      await prepareRemotePlayback({
        request: body,
        userId: locals.user.id,
        label: "AirPlay",
        origin: url.origin,
      }),
    );
  } catch (error) {
    if (error instanceof RemotePlaybackRequestError) {
      return json({ error: error.message }, { status: error.status });
    }
    return json(
      { error: "Could not prepare AirPlay playback." },
      { status: 500 },
    );
  }
};
