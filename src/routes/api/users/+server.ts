import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { UserResponse, UsersResponse } from "$lib/server/api/types";
import { readJsonBody, requireJsonAdmin } from "$lib/server/api";
import { parseCreateUserInput } from "$lib/server/auth/users-input";
import { createManagedUser, listManagedUsers, userManagementHttpStatus } from "$lib/server/auth/users-admin";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, request }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    return apiJson<UsersResponse>({
      users: await listManagedUsers(request.headers),
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not list users.", userManagementHttpStatus(error));
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const input = parseCreateUserInput(body);
    const created = await createManagedUser({
      headers: request.headers,
      ...input,
    });
    return apiJson<UserResponse>({ user: created }, { status: 201 });
  } catch (error) {
    return apiErrorFrom(error, "Could not create user.", userManagementHttpStatus(error));
  }
};
