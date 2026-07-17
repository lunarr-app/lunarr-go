import { auth } from "$lib/server/auth";
import { hasRegisteredUsers } from "$lib/server/auth/users";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  if (await hasRegisteredUsers()) throw redirect(303, "/login");
};

export const actions: Actions = {
  default: async ({ request }) => {
    if (await hasRegisteredUsers()) {
      return fail(403, {
        name: "",
        email: "",
        error: "Setup is already complete.",
      });
    }

    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!name || !email || !password) {
      return fail(400, {
        name,
        email,
        error: "Name, email, and password are required.",
      });
    }

    try {
      await auth.api.signUpEmail({
        body: { name, email, password },
        headers: request.headers,
      });
    } catch (error) {
      return fail(400, {
        name,
        email,
        error:
          error && typeof error === "object" && "message" in error
            ? String(error.message)
            : "Could not create account.",
      });
    }

    throw redirect(303, "/continue");
  },
};
