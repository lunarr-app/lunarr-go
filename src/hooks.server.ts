import { building } from "$app/environment";
import { auth } from "$lib/server/auth";
import { hasRegisteredUsers } from "$lib/server/auth/users";
import { migrateDatabase } from "$lib/server/db";
import { cleanupJobHistory } from "$lib/server/jobs";
import { SIGNED_PLAYBACK_TOKEN_QUERY_PARAM } from "$lib/server/playback/signed-token";
import { resumeInterruptedJobs } from "$lib/server/scanner";
import { syncScheduledLibraryScans } from "$lib/server/scanner/scheduler";
import { syncLibraryWatchers } from "$lib/server/scanner/watchers";
import { startStaleTranscodeExpiryLoop } from "$lib/server/transcoding/manager";
import {
  cleanupConfiguredPlaybackSessionArtifacts,
  recoverInterruptedTranscodeSessions,
} from "$lib/server/transcoding/sessions";
import { json, redirect, type Handle, type RequestEvent } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";

let startupPromise: Promise<void> | undefined;

function ensureStartup() {
  startupPromise ??= (async () => {
    await migrateDatabase();
    await recoverInterruptedTranscodeSessions();
    await cleanupConfiguredPlaybackSessionArtifacts();
    await cleanupJobHistory();
    await resumeInterruptedJobs();
    if (!building) {
      startStaleTranscodeExpiryLoop();
      await syncLibraryWatchers();
      await syncScheduledLibraryScans();
    }
  })().catch((error) => {
    startupPromise = undefined;
    throw error;
  });
  return startupPromise;
}

function isAuthApiPath(pathname: string) {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

function isPublicApiPath(pathname: string) {
  return pathname === "/api/openapi.json" || pathname === "/api/openapi.yaml";
}

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/setup" ||
    isPublicApiPath(pathname) ||
    isAuthApiPath(pathname)
  );
}

function isMediaResourcePath(pathname: string) {
  return (
    pathname.startsWith("/media/files/") ||
    pathname.startsWith("/media/subtitles/") ||
    pathname.startsWith("/media/playback-sessions/")
  );
}

function canResolveUnauthenticatedMediaResource(event: RequestEvent) {
  return (
    event.request.method === "OPTIONS" ||
    event.url.searchParams.has(SIGNED_PLAYBACK_TOKEN_QUERY_PARAM)
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  await ensureStartup();

  const session = await auth.api
    .getSession({ headers: event.request.headers })
    .catch((error) => {
      if (event.request.headers.has("x-api-key")) return null;
      throw error;
    });

  event.locals.session = session?.session ?? null;
  event.locals.user = session?.user ?? null;

  const pathname = event.url.pathname;
  const hasUsers = await hasRegisteredUsers();
  const canResolveUnauthenticatedMedia =
    isMediaResourcePath(pathname) &&
    canResolveUnauthenticatedMediaResource(event);

  if (
    !hasUsers &&
    pathname !== "/setup" &&
    !isAuthApiPath(pathname) &&
    !isPublicApiPath(pathname)
  ) {
    if (pathname.startsWith("/api/") || isMediaResourcePath(pathname))
      return json({ error: "Unauthorized" }, { status: 401 });
    throw redirect(303, "/setup");
  }

  if (
    event.locals.user &&
    (pathname === "/login" || pathname === "/signup" || pathname === "/setup")
  ) {
    throw redirect(303, "/movies");
  }

  if (
    pathname.startsWith("/api/") &&
    !isAuthApiPath(pathname) &&
    !isPublicApiPath(pathname) &&
    !event.locals.user
  ) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    isMediaResourcePath(pathname) &&
    !event.locals.user &&
    !canResolveUnauthenticatedMedia
  ) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    hasUsers &&
    !event.locals.user &&
    !isPublicPath(pathname) &&
    !canResolveUnauthenticatedMedia
  ) {
    throw redirect(303, "/login");
  }

  return svelteKitHandler({ event, resolve, auth, building });
};
