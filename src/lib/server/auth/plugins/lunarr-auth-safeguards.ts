import type { BetterAuthPlugin } from "better-auth";
import { guardLastAdminOnUserRoleUpdate } from "../admin-safeguards";

export function lunarrAuthSafeguards(): BetterAuthPlugin {
  return {
    id: "lunarr-auth-safeguards",
    init() {
      return {
        options: {
          databaseHooks: {
            user: {
              update: {
                before: async (user, ctx) => {
                  const data = user && typeof user === "object" && !Array.isArray(user) ? user : {};
                  return guardLastAdminOnUserRoleUpdate(data as Record<string, unknown>, ctx);
                },
              },
            },
          },
        },
      };
    },
  };
}
