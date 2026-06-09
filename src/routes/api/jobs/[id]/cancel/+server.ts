import { requireJsonAdmin } from "$lib/server/api";
import { cancelScanJob } from "$lib/server/scanner";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const result = await cancelScanJob(params.id);
  if (result === "missing") return json({ error: "Scan job was not found." }, { status: 404 });
  if (result === "inactive") return json({ error: "Scan job is not active." }, { status: 400 });

  return json({ ok: true });
};
