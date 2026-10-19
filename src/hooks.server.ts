import { redirect } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { building } from "$app/env";
import { auth } from "#lib/server/auth/index.js";
import { hasRegisteredUsers } from "#lib/server/auth/users.js";
import { cleanupStaleDevicePairings } from "#lib/server/auth/device-pairing.js";
import { ensureDatabaseReady } from "#lib/server/db/index.js";
import { cleanupJobHistory } from "#lib/server/jobs/index.js";
import { cleanupExpiredShares } from "#lib/server/shares/index.js";
import { SIGNED_PLAYBACK_TOKEN_QUERY_PARAM } from "#lib/server/playback/signed-token.js";
import { SHARE_TOKEN_QUERY_PARAM } from "#lib/shares/constants.js";
import { resumeInterruptedJobs } from "#lib/server/scanner/scan-jobs.js";
import { syncScheduledLibraryScans } from "#lib/server/scanner/scheduler.js";
import { syncLibraryWatchers } from "#lib/server/scanner/watchers.js";
import { startStaleTranscodeExpiryLoop } from "#lib/server/transcoding/manager.js";
import { syncScheduledMetadataRefresh } from "#lib/server/metadata/scheduler.js";
import {
  cleanupConfiguredPlaybackSessionArtifacts,
  recoverInterruptedTranscodeSessions,
} from "#lib/server/transcoding/sessions.js";
import {
  loginPathWithRedirect,
  POST_LOGIN_REDIRECT_QUERY_PARAM,
  sanitizePostLoginRedirect,
} from "#lib/auth/post-login-redirect.js";

import { apiError } from "#lib/server/api/json.js";
import { svelteKitHandler } from "better-auth/svelte-kit";

let startupPromise: Promise<void> | undefined;

function ensureStartup() {
  startupPromise ??= (async () => {
    await ensureDatabaseReady();
    await recoverInterruptedTranscodeSessions();
    await cleanupConfiguredPlaybackSessionArtifacts();
    await cleanupJobHistory();
    await cleanupExpiredShares();
    await cleanupStaleDevicePairings();
    await resumeInterruptedJobs();
    if (!building) {
      startStaleTranscodeExpiryLoop();
      await syncLibraryWatchers();
      await syncScheduledLibraryScans();
      await syncScheduledMetadataRefresh();
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
  return (
    pathname === "/api/health" ||
    pathname === "/api/device-pairing" ||
    pathname === "/api/device-pairing/poll" ||
    pathname === "/api/openapi.json" ||
    pathname === "/api/openapi.yaml" ||
    pathname === "/api/share" ||
    pathname.startsWith("/api/share/")
  );
}

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/setup" ||
    pathname === "/share" ||
    pathname.startsWith("/share/") ||
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
    event.url.searchParams.has(SIGNED_PLAYBACK_TOKEN_QUERY_PARAM) ||
    event.url.searchParams.has(SHARE_TOKEN_QUERY_PARAM)
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  await ensureStartup();

  const session = await auth.api.getSession({ headers: event.request.headers }).catch((error) => {
    if (event.request.headers.has("x-api-key")) return null;
    throw error;
  });

  event.locals.session = session?.session ?? null;
  event.locals.user = session?.user ?? null;

  const pathname = event.url.pathname;
  const hasUsers = await hasRegisteredUsers();
  const canResolveUnauthenticatedMedia = isMediaResourcePath(pathname) && canResolveUnauthenticatedMediaResource(event);

  if (!hasUsers && pathname !== "/setup" && !isAuthApiPath(pathname) && !isPublicApiPath(pathname)) {
    if (pathname.startsWith("/api/") || isMediaResourcePath(pathname)) return apiError("Unauthorized", 401);
    throw redirect(303, "/setup");
  }

  if (event.locals.user && (pathname === "/login" || pathname === "/signup" || pathname === "/setup")) {
    const redirectTo = sanitizePostLoginRedirect(event.url.searchParams.get(POST_LOGIN_REDIRECT_QUERY_PARAM));
    throw redirect(303, redirectTo ?? "/continue");
  }

  if (pathname.startsWith("/api/") && !isAuthApiPath(pathname) && !isPublicApiPath(pathname) && !event.locals.user) {
    return apiError("Unauthorized", 401);
  }

  if (isMediaResourcePath(pathname) && !event.locals.user && !canResolveUnauthenticatedMedia) {
    return apiError("Unauthorized", 401);
  }

  if (hasUsers && !event.locals.user && !isPublicPath(pathname) && !canResolveUnauthenticatedMedia) {
    throw redirect(303, loginPathWithRedirect(`${pathname}${event.url.search}`));
  }

  return svelteKitHandler({ event, resolve, auth, building });
};
