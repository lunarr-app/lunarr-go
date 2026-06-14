import { openApiDocument } from "$lib/server/openapi";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => json(openApiDocument);
