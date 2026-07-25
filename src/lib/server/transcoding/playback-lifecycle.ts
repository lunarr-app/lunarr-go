import {
  deleteTranscodeHlsArtifacts,
  getTranscodeSession,
  listActiveTranscodeSessions,
  listIdleReadyHlsTranscodeSessions,
  listRunningHlsTranscodeSessions,
  listStaleActiveTranscodeSessions,
  updateActiveTranscodeSessionStatus,
  updateTranscodeSessionStatus,
} from "./sessions";
import { getPlaybackCacheBindingForSession, releasePlaybackCacheForSession } from "./cache";
import type { ClientPlaybackCapabilities } from "$lib/playback/capabilities";
import { type HlsSegmentFormat, hlsSegmentName, pruneHlsSegmentsBehind } from "./hls";
import { TRANSCODING_DISABLED_MESSAGE } from "./hls-segment-jobs";
import { onEncodeSessionEnded } from "./encode-coordinator";
import { transcodeBackend } from "./ffmpeg-cli";
import { currentDatabasePaths } from "../db";
import { rm } from "node:fs/promises";
import path from "node:path";

const PLAYBACK_CANCELLED_MESSAGE = "Playback session was cancelled.";
const PLAYBACK_HEARTBEAT_EXPIRED_MESSAGE = "Playback session expired because playback stopped.";
const PLAYBACK_SEGMENT_IDLE_EXPIRED_MESSAGE = "Playback session expired because playback stopped requesting segments.";
const TRANSCODE_HEARTBEAT_TIMEOUT_MS = 120_000;
const TRANSCODE_SEGMENT_IDLE_TIMEOUT_MS = 300_000;
const ACTIVE_TRANSCODE_CANCEL_BATCH_SIZE = 100;

function hlsSegmentFormatFromSegmentName(segment: string): HlsSegmentFormat {
  return path.extname(segment).toLowerCase() === ".m4s" ? "fmp4" : "mpegts";
}

export function requestDrivenHlsSegmentFormat(
  input: {
    clientCapabilities?: Partial<ClientPlaybackCapabilities> | null;
    segment?: string;
  } = {},
): HlsSegmentFormat {
  if (input.segment) return hlsSegmentFormatFromSegmentName(input.segment);
  const value = process.env.LUNARR_HLS_SEGMENT_FORMAT?.trim().toLowerCase();
  const configured = value === "fmp4" || value === "mpegts" || value === "auto" ? value : "mpegts";
  if (configured === "fmp4") return "fmp4";
  if (configured === "auto" && input.clientCapabilities?.hlsFmp4 === true) {
    return "fmp4";
  }
  return "mpegts";
}

export type CancelPlaybackSessionResult = "cancelled" | "inactive" | "missing";

export async function removeTranscodeSessionArtifacts(sessionId: string) {
  await releasePlaybackCacheForSession(sessionId).catch(() => undefined);
  await Promise.all([
    deleteTranscodeHlsArtifacts(sessionId).catch(() => undefined),
    rm(path.join(currentDatabasePaths().dataDir, "playback-sessions", sessionId), {
      recursive: true,
      force: true,
    }).catch(() => undefined),
  ]);
}

export async function cleanupTranscodeStartupFailure(sessionId: string) {
  await transcodeBackend.cancel(sessionId).catch(() => undefined);
  await removeTranscodeSessionArtifacts(sessionId);
}

async function clearRequestDrivenSessionWork(sessionId: string) {
  const { abortActiveSegmentEnsuresForSession } = await import("./segment-request-gateway");
  abortActiveSegmentEnsuresForSession(sessionId);
  onEncodeSessionEnded(sessionId);
}

export async function stopRequestDrivenSegmentWork(sessionId: string) {
  await clearRequestDrivenSessionWork(sessionId);
  await transcodeBackend.cancel(sessionId).catch(() => undefined);
}

export async function cancelPlaybackSession(
  sessionId: string,
  message = PLAYBACK_CANCELLED_MESSAGE,
): Promise<CancelPlaybackSessionResult> {
  const session = await getTranscodeSession(sessionId);
  if (!session) return "missing";
  if (session.status !== "queued" && session.status !== "running" && session.status !== "completed") return "inactive";

  const updated =
    session.status === "completed"
      ? (await updateTranscodeSessionStatus(sessionId, "cancelled", message), true)
      : await updateActiveTranscodeSessionStatus(sessionId, "cancelled", message);
  if (!updated) return "inactive";

  await stopRequestDrivenSegmentWork(sessionId);
  await releasePlaybackCacheForSession(sessionId).catch(() => undefined);

  return "cancelled";
}

export async function expireStalePlaybackSessions(maxIdleMs = TRANSCODE_HEARTBEAT_TIMEOUT_MS): Promise<number> {
  const cutoffIso = new Date(Date.now() - Math.max(0, maxIdleMs)).toISOString();
  const sessions = await listStaleActiveTranscodeSessions(cutoffIso);
  let expired = 0;
  for (const session of sessions) {
    const result = await cancelPlaybackSession(session.sessionId, PLAYBACK_HEARTBEAT_EXPIRED_MESSAGE);
    if (result === "cancelled") expired += 1;
  }
  return expired;
}

export async function expireIdleReadyHlsPlaybackSessions(
  maxIdleMs = TRANSCODE_SEGMENT_IDLE_TIMEOUT_MS,
): Promise<number> {
  const cutoffIso = new Date(Date.now() - Math.max(0, maxIdleMs)).toISOString();
  const sessions = await listIdleReadyHlsTranscodeSessions(cutoffIso);
  let expired = 0;
  for (const session of sessions) {
    const result = await cancelPlaybackSession(session.sessionId, PLAYBACK_SEGMENT_IDLE_EXPIRED_MESSAGE);
    if (result === "cancelled") expired += 1;
  }
  return expired;
}

export async function cancelActivePlaybackSessions(message = TRANSCODING_DISABLED_MESSAGE): Promise<number> {
  let cancelled = 0;

  while (true) {
    const sessions = await listActiveTranscodeSessions(ACTIVE_TRANSCODE_CANCEL_BATCH_SIZE);
    if (sessions.length === 0) break;

    let batchCancelled = 0;
    for (const session of sessions) {
      const result = await cancelPlaybackSession(session.sessionId, message);
      if (result === "cancelled") {
        cancelled += 1;
        batchCancelled += 1;
      }
    }

    if (sessions.length < ACTIVE_TRANSCODE_CANCEL_BATCH_SIZE || batchCancelled === 0) break;
  }

  return cancelled;
}

export async function pruneActiveHlsSegmentArtifacts(keepBehind?: number): Promise<number> {
  const sessions = await listRunningHlsTranscodeSessions();
  let pruned = 0;

  for (const session of sessions) {
    if (session.lastSegmentIndex === null) continue;
    const binding = await getPlaybackCacheBindingForSession(session.sessionId);
    pruned += await pruneHlsSegmentsBehind(
      session.playlistPath,
      hlsSegmentName(
        session.lastSegmentIndex,
        session.lastSegmentName
          ? hlsSegmentFormatFromSegmentName(session.lastSegmentName)
          : requestDrivenHlsSegmentFormat(),
      ),
      binding.encodeArtifactDirectory ?? undefined,
      keepBehind,
    ).catch(() => 0);
  }

  return pruned;
}
