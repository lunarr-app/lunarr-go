import { auth } from "$lib/server/auth";
import { sanitizePostLoginRedirect } from "$lib/server/auth/post-login-redirect";
import { signupAllowed } from "$lib/server/auth/users";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
  return {
    signupOpen: await signupAllowed(),
    redirectTo: sanitizePostLoginRedirect(url.searchParams.get("redirectTo")) ?? "",
  };
};

export const actions: Actions = {
  signIn: async ({ request }) => {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "").trim();
    const redirectTo = sanitizePostLoginRedirect(String(form.get("redirectTo") ?? ""));

    if (!email || !password) {
      return fail(400, {
        email,
        redirectTo: redirectTo ?? "",
        error: "Email and password are required.",
      });
    }

    try {
      await auth.api.signInEmail({
        body: { email, password, rememberMe: true },
        headers: request.headers,
      });
    } catch (error) {
      return fail(400, {
        email,
        redirectTo: redirectTo ?? "",
        error: error && typeof error === "object" && "message" in error ? String(error.message) : "Could not sign in.",
      });
    }

    throw redirect(303, redirectTo ?? "/movies");
  },
};
