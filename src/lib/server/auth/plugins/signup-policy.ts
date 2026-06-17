import type { BetterAuthPlugin } from "better-auth";
import { roleForNewUser, signupAllowed } from "../users";

export function lunarrSignupPolicy(): BetterAuthPlugin {
  return {
    id: "lunarr-signup-policy",
    init() {
      return {
        options: {
          databaseHooks: {
            user: {
              create: {
                before: async (user, ctx) => {
                  const path =
                    ctx && typeof ctx === "object" && "path" in ctx ? String((ctx as { path?: string }).path) : "";
                  if (path.endsWith("/admin/create-user")) {
                    return { data: user };
                  }
                  if (!(await signupAllowed())) return false;
                  return {
                    data: {
                      ...user,
                      role: await roleForNewUser(),
                    },
                  };
                },
              },
            },
          },
        },
      };
    },
  };
}
