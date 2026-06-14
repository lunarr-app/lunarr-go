import { auth } from "$lib/server/auth";
import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  await auth.api.signOut({ headers: request.headers });
  throw redirect(303, "/login");
};

export const GET: RequestHandler = async () => {
  return new Response("Method Not Allowed", { status: 405 });
};
