import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse } from "$lib/server/api/types";
import { readJsonBody, requireJsonUser } from "$lib/server/api";
import { normalizeContinueMaxAgeDays, setUserContinueMaxAgeDays } from "$lib/server/media/continue-max-age";
import type { RequestHandler } from "./$types";

export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const values = typeof body === "object" && body ? (body as { continueMaxAgeDays?: unknown }) : {};

    if (!("continueMaxAgeDays" in values)) {
      return apiErrorFrom(new Error("continueMaxAgeDays is required."), "Could not update continue max age.");
    }

    await setUserContinueMaxAgeDays(
      user.id,
      normalizeContinueMaxAgeDays(values.continueMaxAgeDays as string | number | null | undefined),
    );
    return apiJson<ApiOkResponse>({ ok: true });
  } catch (error) {
    return apiErrorFrom(error, "Could not update continue max age.");
  }
};
