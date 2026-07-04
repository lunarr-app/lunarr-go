import { apiJson } from "$lib/server/api/json";
import type { HealthResponse } from "$lib/server/api/types";
import { getHealthStatus } from "$lib/server/health";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const health = await getHealthStatus();
  return apiJson<HealthResponse>(health, { status: health.ok ? 200 : 503 });
};
