import { openApiYaml } from "$lib/server/openapi";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () =>
  new Response(openApiYaml(), {
    headers: {
      "content-type": "application/yaml; charset=utf-8",
    },
  });
