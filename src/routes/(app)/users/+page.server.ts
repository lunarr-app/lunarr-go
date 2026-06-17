import { isAdmin, requireAdmin } from "$lib/server/auth/users";
import {
  createUserDraft,
  parseCreateUserInput,
  parseUpdateUserRoleInput,
  UserManagementError,
} from "$lib/server/auth/users-input";
import {
  createManagedUser,
  deleteManagedUser,
  listManagedUsers,
  updateManagedUserRole,
} from "$lib/server/auth/users-admin";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

function actionFailure(error: unknown, fallback: string, fields: Record<string, string> = {}) {
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof UserManagementError ? error.status : 400;
  return fail(status, { userActionError: message, ...fields });
}

function createFailure(message: string, status: number, draft: { name: string; email: string; role: string }) {
  return fail(status, { createError: message, name: draft.name, email: draft.email, role: draft.role });
}

export const load: PageServerLoad = async ({ locals, request }) => {
  requireAdmin(locals.user);

  return {
    users: await listManagedUsers(request.headers),
    currentUserId: locals.user!.id,
  };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!isAdmin(locals.user)) {
      return fail(403, { userActionError: "Only admins can manage users." });
    }

    const form = await request.formData();
    const draft = createUserDraft(form);

    try {
      const input = parseCreateUserInput(form);
      await createManagedUser({
        headers: request.headers,
        ...input,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create user.";
      const status = error instanceof UserManagementError ? error.status : 400;
      return createFailure(message, status, draft);
    }

    throw redirect(303, "/users");
  },

  updateRole: async ({ request, locals }) => {
    if (!isAdmin(locals.user)) {
      return fail(403, { userActionError: "Only admins can manage users." });
    }

    const form = await request.formData();
    const userId = String(form.get("userId") ?? "").trim();
    if (!userId) return fail(400, { userActionError: "User is required." });

    try {
      const { role } = parseUpdateUserRoleInput(form);
      await updateManagedUserRole({
        headers: request.headers,
        userId,
        role,
      });
    } catch (error) {
      return actionFailure(error, "Could not update user.");
    }

    throw redirect(303, "/users");
  },

  delete: async ({ request, locals }) => {
    if (!isAdmin(locals.user)) {
      return fail(403, { userActionError: "Only admins can manage users." });
    }

    const form = await request.formData();
    const userId = String(form.get("userId") ?? "").trim();
    if (!userId) return fail(400, { userActionError: "User is required." });

    try {
      await deleteManagedUser({
        headers: request.headers,
        userId,
      });
    } catch (error) {
      return actionFailure(error, "Could not delete user.");
    }

    throw redirect(303, "/users");
  },
};
