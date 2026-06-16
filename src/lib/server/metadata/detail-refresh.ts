import { isAdmin } from "$lib/server/auth/users";
import { fail } from "@sveltejs/kit";
import { tmdbCredentialsConfigured } from "./tmdb";

type MetadataRefreshUser =
  | {
      role?: string | null;
    }
  | null
  | undefined;

export async function metadataRefreshPrerequisites(user: MetadataRefreshUser) {
  if (!isAdmin(user)) {
    return fail(403, { metadataError: "Only admins can refresh metadata." });
  }
  if (!(await tmdbCredentialsConfigured())) {
    return fail(400, {
      metadataError: "TMDb credentials are not configured.",
    });
  }
  return null;
}

export function metadataRefreshFailure(error: unknown) {
  return fail(400, {
    metadataError: error instanceof Error ? error.message : "Could not refresh metadata.",
  });
}
