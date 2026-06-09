import { jsonError, requireJsonAdmin } from "$lib/server/api";
import { startScan } from "$lib/server/scanner";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    return json(await startScan(params.id), { status: 202 });
  } catch (error) {
    return jsonError(error, "Could not start scan.");
  }
};
