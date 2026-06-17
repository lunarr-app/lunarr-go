import { jsonError, readJsonBody, requireJsonAdmin } from "$lib/server/api";
import { parseUpdateUserRoleInput } from "$lib/server/auth/users-input";
import { deleteManagedUser, updateManagedUserRole, userManagementHttpStatus } from "$lib/server/auth/users-admin";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const { role } = parseUpdateUserRoleInput(body);
    const updated = await updateManagedUserRole({
      headers: request.headers,
      userId: params.id,
      role,
    });
    return json({ user: updated });
  } catch (error) {
    return jsonError(error, "Could not update user.", userManagementHttpStatus(error));
  }
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    await deleteManagedUser({
      headers: request.headers,
      userId: params.id,
    });
    return json({ ok: true });
  } catch (error) {
    return jsonError(error, "Could not delete user.", userManagementHttpStatus(error));
  }
};
