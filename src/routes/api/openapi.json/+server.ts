import { openApiDocument } from "#lib/server/openapi.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => Response.json(openApiDocument);
