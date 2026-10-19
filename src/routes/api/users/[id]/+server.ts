import { apiErrorFrom, apiJson } from "#lib/server/api/json.js";
import type { UserResponse } from "#lib/server/api/types.js";
import { parseBody, recordObjectSchema, requireJsonAdmin } from "#lib/server/api.js";
import { parseUpdateUserRoleInput } from "#lib/server/auth/users-input.js";
import { deleteManagedUser, updateManagedUserRole, userManagementHttpStatus } from "#lib/server/auth/users-admin.js";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const body = await parseBody(request, recordObjectSchema);
    const { role } = parseUpdateUserRoleInput(body);
    const updated = await updateManagedUserRole({
      headers: request.headers,
      userId: params.id,
      role,
    });
    return apiJson<UserResponse>({ user: updated });
  } catch (error) {
    return apiErrorFrom(error, "Could not update user.", userManagementHttpStatus(error));
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
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorFrom(error, "Could not delete user.", userManagementHttpStatus(error));
  }
};
