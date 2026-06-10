import { isAdmin, requireAdmin } from "$lib/server/auth/users";
import {
  createLibrary,
  deleteLibrary,
  listLibrariesWithScanStatus,
  listLibraryShareUsers,
  updateLibrary,
  updateLibraryAccess,
} from "$lib/server/libraries";
import {
  libraryFormState,
  parseCreateLibraryInput,
  parseUpdateLibraryInput,
} from "$lib/server/libraries/input";
import { tmdbCredentialsConfigured } from "$lib/server/metadata/tmdb";
import { startScan } from "$lib/server/scanner";
import { syncScheduledLibraryScans } from "$lib/server/scanner/scheduler";
import { syncLibraryWatchers } from "$lib/server/scanner/watchers";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  return {
    libraries: await listLibrariesWithScanStatus(),
    users: await listLibraryShareUsers(),
    tmdbConfigured: await tmdbCredentialsConfigured(),
  };
};

export const actions: Actions = {
  add: async ({ request, locals }) => {
    const form = await request.formData();
    const state = libraryFormState(form);
    if (!isAdmin(locals.user))
      return fail(403, {
        ...state,
        addError: "Only admins can add libraries.",
      });

    try {
      await createLibrary(parseCreateLibraryInput(form));
      await syncLibraryWatchers();
      await syncScheduledLibraryScans();
    } catch (error) {
      return fail(400, {
        ...state,
        addError:
          error instanceof Error ? error.message : "Could not add library.",
      });
    }

    throw redirect(303, "/libraries");
  },
  scan: async ({ request, locals }) => {
    const form = await request.formData();
    const libraryId = String(form.get("libraryId") ?? "");
    if (!isAdmin(locals.user))
      return fail(403, {
        libraryActionError: "Only admins can scan libraries.",
      });
    if (!libraryId)
      return fail(400, { libraryActionError: "Library is required." });

    try {
      await startScan(libraryId);
    } catch (error) {
      return fail(400, {
        libraryActionError:
          error instanceof Error ? error.message : "Could not start scan.",
      });
    }

    throw redirect(303, "/jobs");
  },
  edit: async ({ request, locals }) => {
    const form = await request.formData();
    const libraryId = String(form.get("libraryId") ?? "");
    if (!isAdmin(locals.user))
      return fail(403, {
        libraryActionError: "Only admins can edit libraries.",
      });
    if (!libraryId)
      return fail(400, { libraryActionError: "Library is required." });

    try {
      await updateLibrary(libraryId, parseUpdateLibraryInput(form));
      await syncLibraryWatchers();
      await syncScheduledLibraryScans();
    } catch (error) {
      return fail(400, {
        libraryActionError:
          error instanceof Error ? error.message : "Could not update library.",
      });
    }

    throw redirect(303, "/libraries");
  },
  delete: async ({ request, locals }) => {
    const form = await request.formData();
    const libraryId = String(form.get("libraryId") ?? "");
    if (!isAdmin(locals.user))
      return fail(403, {
        libraryActionError: "Only admins can remove libraries.",
      });
    if (!libraryId)
      return fail(400, { libraryActionError: "Library is required." });

    try {
      await deleteLibrary(libraryId);
      await syncLibraryWatchers();
      await syncScheduledLibraryScans();
    } catch (error) {
      return fail(400, {
        libraryActionError:
          error instanceof Error ? error.message : "Could not remove library.",
      });
    }

    throw redirect(303, "/libraries");
  },
  access: async ({ request, locals }) => {
    const form = await request.formData();
    const libraryId = String(form.get("libraryId") ?? "");
    const accessMode = String(form.get("accessMode") ?? "all");
    const userIds = form.getAll("userIds").map((value) => String(value));
    if (!isAdmin(locals.user))
      return fail(403, {
        libraryActionError: "Only admins can share libraries.",
      });
    if (!libraryId)
      return fail(400, { libraryActionError: "Library is required." });

    try {
      await updateLibraryAccess(libraryId, accessMode, userIds);
    } catch (error) {
      return fail(400, {
        libraryActionError:
          error instanceof Error
            ? error.message
            : "Could not update library sharing.",
      });
    }

    throw redirect(303, "/libraries");
  },
};
