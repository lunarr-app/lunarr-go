import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { currentDatabasePaths, getDb } from "../db";
import { getSetting, setSetting } from "../settings";
import {
  cleanupPlaybackHlsCache,
  getPlaybackCacheTtlMs,
  releasePlaybackCacheForSession,
  sumPlaybackCacheBytes,
} from "./cache";

export type CleanedPlaybackSessionArtifacts = {
  sessions: number;
  cleaned: number;
};

type OrphanedPlaybackSessionArtifactDirectory = {
  directory: string;
  mtimeMs: number;
  bytes: number;
};

export const PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS = [
  5 * 1024 * 1024 * 1024,
  10 * 1024 * 1024 * 1024,
  20 * 1024 * 1024 * 1024,
  50 * 1024 * 1024 * 1024,
  100 * 1024 * 1024 * 1024,
] as const;
export const DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_BYTES = 20 * 1024 * 1024 * 1024;
const PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_KEY = "playback_session_artifact_max_bytes";
const DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const ENDED_PLAYBACK_ARTIFACT_MAX_IDLE_MS = 60_000;

function playbackSessionArtifactRoot() {
  return path.join(currentDatabasePaths().dataDir, "playback-sessions");
}

function defaultPlaybackSessionArtifactDirectory(sessionId: string) {
  return path.join(playbackSessionArtifactRoot(), sessionId);
}

function isPathInside(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isPathSameOrInside(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safePlaybackSessionArtifactDirectories(input: { sessionId: string; playlistPath: string | null }) {
  const root = playbackSessionArtifactRoot();
  const directories = new Set([defaultPlaybackSessionArtifactDirectory(input.sessionId)]);
  if (input.playlistPath) directories.add(path.dirname(input.playlistPath));

  const safeDirectories = [...directories].filter((directory) => isPathInside(root, directory));
  return safeDirectories.filter(
    (directory) => !safeDirectories.some((other) => other !== directory && isPathSameOrInside(other, directory)),
  );
}

export function latestActivityAt(input: {
  lastHeartbeatAt?: string | null;
  lastSegmentRequestAt?: string | null;
  updatedAt: string;
}) {
  return [input.lastHeartbeatAt, input.lastSegmentRequestAt, input.updatedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)!;
}

export function endedPlaybackArtifactActivityAt(input: { lastSegmentRequestAt?: string | null; updatedAt: string }) {
  return [input.lastSegmentRequestAt, input.updatedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)!;
}

export function isEndedPlaybackArtifactFresh(input: { lastSegmentRequestAt?: string | null; updatedAt: string }) {
  const endedArtifactCutoff = new Date(Date.now() - ENDED_PLAYBACK_ARTIFACT_MAX_IDLE_MS).toISOString();
  return endedPlaybackArtifactActivityAt(input) >= endedArtifactCutoff;
}

export function normalizePlaybackSessionArtifactMaxBytes(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(String(value ?? ""));
  return PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS.includes(
    numeric as (typeof PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_OPTIONS)[number],
  )
    ? numeric
    : DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_BYTES;
}

export async function getPlaybackSessionArtifactMaxBytes() {
  return normalizePlaybackSessionArtifactMaxBytes(await getSetting(PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_KEY));
}

export async function setPlaybackSessionArtifactMaxBytes(value: unknown) {
  await setSetting(PLAYBACK_SESSION_ARTIFACT_MAX_BYTES_KEY, String(normalizePlaybackSessionArtifactMaxBytes(value)));
}

async function directorySizeBytes(directory: string): Promise<number> {
  let details;
  try {
    details = await stat(directory);
  } catch {
    return 0;
  }
  if (!details.isDirectory()) return details.size;

  let total = 0;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await directorySizeBytes(entryPath);
    } else if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}

async function removeSafePlaybackSessionArtifactDirectories(input: { sessionId: string; playlistPath: string | null }) {
  const directories = safePlaybackSessionArtifactDirectories(input);
  let cleaned = 0;
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true });
    cleaned += 1;
  }
  return cleaned;
}

async function listOrphanedPlaybackSessionArtifactDirectories(
  knownSessionIds: Set<string>,
): Promise<OrphanedPlaybackSessionArtifactDirectory[]> {
  const root = playbackSessionArtifactRoot();
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const directories: OrphanedPlaybackSessionArtifactDirectory[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || knownSessionIds.has(entry.name)) continue;
    const directory = path.join(root, entry.name);
    const details = await stat(directory).catch(() => null);
    if (!details?.isDirectory()) continue;
    directories.push({
      directory,
      mtimeMs: details.mtimeMs,
      bytes: await directorySizeBytes(directory),
    });
  }

  return directories;
}

export async function clearPlaybackSessionArtifacts(input: { sessionId: string; playlistPath: string | null }) {
  const cleaned = await removeSafePlaybackSessionArtifactDirectories(input);
  const db = await getDb();
  await db.deleteFrom("playback_hls_artifact").where("playback_session_id", "=", input.sessionId).execute();
  await releasePlaybackCacheForSession(input.sessionId).catch(() => undefined);
  return cleaned;
}

export async function cleanupExpiredPlaybackSessionArtifacts(
  maxAgeMs = DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_AGE_MS,
  maxBytes = DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_BYTES,
  endedPlaybackArtifactMaxAgeMs = Math.min(maxAgeMs, ENDED_PLAYBACK_ARTIFACT_MAX_IDLE_MS),
): Promise<CleanedPlaybackSessionArtifacts> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - Math.max(0, maxAgeMs)).toISOString();
  const endedPlaybackArtifactCutoff = new Date(Date.now() - Math.max(0, endedPlaybackArtifactMaxAgeMs)).toISOString();
  const knownSessionRows = await db.selectFrom("playback_session").select("id").execute();
  const knownSessionIds = new Set(knownSessionRows.map((row) => row.id));
  const sessions = await db
    .selectFrom("playback_session")
    .leftJoin("playback_hls_artifact", (join) =>
      join.onRef("playback_hls_artifact.playback_session_id", "=", "playback_session.id"),
    )
    .select([
      "playback_session.id as sessionId",
      "playback_session.status as status",
      "playback_hls_artifact.path as playlistPath",
      "playback_session.updated_at as updatedAt",
      "playback_session.last_heartbeat_at as lastHeartbeatAt",
      "playback_session.last_segment_request_at as lastSegmentRequestAt",
    ])
    .where("playback_session.status", "in", ["completed", "failed", "cancelled"])
    .orderBy("playback_session.updated_at", "asc")
    .execute();

  const cleanedSessionIds = new Set<string>();
  const cleanedOrphanDirectories = new Set<string>();
  let cleaned = 0;
  const orphanDirectories = await listOrphanedPlaybackSessionArtifactDirectories(knownSessionIds);
  const orphanCutoffMs = Date.now() - Math.max(0, maxAgeMs);
  for (const session of sessions.filter((item) => {
    const sessionCutoff = item.status === "completed" ? endedPlaybackArtifactCutoff : cutoff;
    const activityAt = item.status === "completed" ? endedPlaybackArtifactActivityAt(item) : latestActivityAt(item);
    return activityAt < sessionCutoff;
  })) {
    cleaned += await clearPlaybackSessionArtifacts({
      sessionId: session.sessionId,
      playlistPath: session.playlistPath,
    });
    cleanedSessionIds.add(session.sessionId);
  }
  for (const orphan of orphanDirectories.filter((directory) => directory.mtimeMs < orphanCutoffMs)) {
    await rm(orphan.directory, { recursive: true, force: true });
    cleanedOrphanDirectories.add(orphan.directory);
    cleaned += 1;
  }

  const remaining = sessions.filter((session) => !cleanedSessionIds.has(session.sessionId));
  const sessionSizes = await Promise.all(
    remaining.map(async (session) => {
      let bytes = 0;
      for (const directory of safePlaybackSessionArtifactDirectories(session)) {
        bytes += await directorySizeBytes(directory);
      }
      return { ...session, bytes };
    }),
  );
  const remainingOrphanDirectories = orphanDirectories.filter(
    (directory) => !cleanedOrphanDirectories.has(directory.directory),
  );

  let totalBytes =
    sessionSizes.reduce((total, session) => total + session.bytes, 0) +
    remainingOrphanDirectories.reduce((total, directory) => total + directory.bytes, 0);
  const byteLimit = Math.max(0, maxBytes);
  const artifactSizes = [
    ...sessionSizes.map((session) => ({
      kind: "session" as const,
      sortMs: Date.parse(
        session.status === "completed" ? endedPlaybackArtifactActivityAt(session) : latestActivityAt(session),
      ),
      bytes: session.bytes,
      session,
    })),
    ...remainingOrphanDirectories.map((directory) => ({
      kind: "orphan" as const,
      sortMs: directory.mtimeMs,
      bytes: directory.bytes,
      directory,
    })),
  ].sort((a, b) => a.sortMs - b.sortMs);

  for (const artifact of artifactSizes) {
    if (totalBytes <= byteLimit) break;
    if (artifact.kind === "session") {
      cleaned += await clearPlaybackSessionArtifacts({
        sessionId: artifact.session.sessionId,
        playlistPath: artifact.session.playlistPath,
      });
      cleanedSessionIds.add(artifact.session.sessionId);
    } else {
      await rm(artifact.directory.directory, { recursive: true, force: true });
      cleanedOrphanDirectories.add(artifact.directory.directory);
      cleaned += 1;
    }
    totalBytes -= artifact.bytes;
  }

  return { sessions: cleanedSessionIds.size, cleaned };
}

export type PlaybackArtifactsCleanupResult = {
  cacheRemoved: number;
  sessionsRemoved: number;
  sessionArtifactsRemoved: number;
};

export function formatPlaybackArtifactsCleanupMessage(result: PlaybackArtifactsCleanupResult) {
  const parts: string[] = [];
  if (result.cacheRemoved > 0) {
    parts.push(`${result.cacheRemoved} idle HLS cache ${result.cacheRemoved === 1 ? "entry" : "entries"}`);
  }
  if (result.sessionArtifactsRemoved > 0) {
    parts.push(
      `${result.sessionArtifactsRemoved} session artifact ${result.sessionArtifactsRemoved === 1 ? "directory" : "directories"}`,
    );
  }
  if (parts.length === 0) return "No idle HLS cache or session artifacts to clean up.";
  return `Removed ${parts.join(" and ")}.`;
}

export async function cleanupConfiguredPlaybackSessionArtifacts(
  maxAgeMs = DEFAULT_PLAYBACK_SESSION_ARTIFACT_MAX_AGE_MS,
  options?: { forceIdleCache?: boolean },
): Promise<PlaybackArtifactsCleanupResult> {
  const maxBytes = await getPlaybackSessionArtifactMaxBytes();
  const cacheResult = await cleanupPlaybackHlsCache(maxBytes, await getPlaybackCacheTtlMs(), {
    forceIdle: options?.forceIdleCache,
  });
  const cacheBytes = await sumPlaybackCacheBytes();
  const sessionResult = await cleanupExpiredPlaybackSessionArtifacts(maxAgeMs, Math.max(0, maxBytes - cacheBytes));
  return {
    cacheRemoved: cacheResult.removed,
    sessionsRemoved: sessionResult.sessions,
    sessionArtifactsRemoved: sessionResult.cleaned,
  };
}
