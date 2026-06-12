import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

const PLAYLIST_MIME_TYPE = "application/vnd.apple.mpegurl";
const MPEG_TS_MIME_TYPE = "video/mp2t";
const FMP4_SEGMENT_MIME_TYPE = "video/iso.segment";
const SEGMENT_ROUTE_PREFIX = "segments/";
const DEFAULT_SEGMENT_KEEP_BEHIND = 12;
export const DEFAULT_HLS_SEGMENT_SECONDS = 16;
export type HlsSegmentFormat = "mpegts" | "fmp4";

type HlsSegmentPayload = {
  body: Uint8Array;
  mimeType: string;
  size: number;
};

type HlsReadOptions = {
  signal?: AbortSignal;
};

export type HlsPlaylistSegmentEntry = {
  segment: string;
  segmentIndex: number | null;
  durationSeconds: number;
  sequenceNumber: number;
  startSeconds: number;
};

type PendingSegmentLoadWaiter = {
  signal?: AbortSignal;
  aborted: boolean;
  abort?: () => void;
};

type PendingSegmentLoad = {
  controller: AbortController;
  promise: Promise<HlsSegmentPayload>;
  waiters: Set<PendingSegmentLoadWaiter>;
};

const pendingSegmentLoads = new Map<string, PendingSegmentLoad>();
let headResponseDelayForTests: (() => Promise<void> | void) | null = null;
let playlistReadDelayForTests: (() => Promise<void> | void) | null = null;
let segmentReadDelayForTests: (() => Promise<void> | void) | null = null;
let segmentReadCountForTests = 0;

export function isSafeHlsSegmentName(segment: string) {
  if (!isSafeHlsBasename(segment)) return false;
  if (isHlsInitArtifactName(segment)) return true;

  const extension = path.extname(segment).toLowerCase();
  if (extension !== ".ts" && extension !== ".m4s" && extension !== ".cmfv") {
    return false;
  }

  return rawHlsSegmentIndex(segment) !== null;
}

function isSafeHlsBasename(segment: string) {
  return (
    segment.length > 0 &&
    segment === path.basename(segment) &&
    !segment.includes("/") &&
    !segment.includes("\\") &&
    !segment.includes("\0")
  );
}

function isHlsInitArtifactName(segment: string) {
  const parsed = path.parse(segment);
  if (parsed.ext.toLowerCase() !== ".mp4") return false;
  return /^init(?:[-_][a-z0-9][a-z0-9._-]*)?$/i.test(parsed.name);
}

function rawHlsSegmentIndex(segment: string) {
  const match = /(?:^|[-_])(\d+)(?:\.[^.]+)?$/.exec(segment);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(index) ? index : null;
}

export function hlsSegmentMimeType(segment: string) {
  const extension = path.extname(segment).toLowerCase();
  if (extension === ".ts") return MPEG_TS_MIME_TYPE;
  if (extension === ".m4s" || extension === ".mp4" || extension === ".cmfv")
    return FMP4_SEGMENT_MIME_TYPE;
  return "application/octet-stream";
}

export function hlsSegmentIndex(segment: string) {
  if (!isSafeHlsSegmentName(segment)) return null;
  if (isHlsInitArtifactName(segment)) return null;
  return rawHlsSegmentIndex(segment);
}

export function hlsSegmentName(
  index: number,
  format: HlsSegmentFormat = "mpegts",
) {
  const safeIndex = Number.isSafeInteger(index) && index >= 0 ? index : 0;
  const extension = format === "fmp4" ? "m4s" : "ts";
  return `segment-${String(safeIndex).padStart(5, "0")}.${extension}`;
}

function canPruneSegment(segment: string) {
  const extension = path.extname(segment).toLowerCase();
  return extension === ".ts" || extension === ".m4s" || extension === ".cmfv";
}

function segmentLoadKey(playlistPath: string, segment: string) {
  return `${path.resolve(playlistPath)}\0${segment}`;
}

async function loadHlsSegmentPayload(
  playlistPath: string,
  segment: string,
  signal?: AbortSignal,
): Promise<HlsSegmentPayload> {
  const segmentPath = path.join(path.dirname(playlistPath), segment);
  let details;
  try {
    details = await stat(segmentPath);
  } catch {
    await waitForMaybeDelayedRead(segmentReadDelayForTests, signal);
    return {
      body: new Uint8Array(),
      mimeType: "text/plain; charset=utf-8",
      size: 0,
    };
  }
  if (!details.isFile()) {
    return {
      body: new Uint8Array(),
      mimeType: "text/plain; charset=utf-8",
      size: 0,
    };
  }

  segmentReadCountForTests += 1;
  await waitForMaybeDelayedRead(segmentReadDelayForTests, signal);
  const body = await readFile(segmentPath, { signal });
  return {
    body,
    mimeType: hlsSegmentMimeType(segment),
    size: details.size,
  };
}

function waitForMaybeDelayedRead(
  delay: (() => Promise<void> | void) | null,
  signal?: AbortSignal,
) {
  if (signal?.aborted) {
    return Promise.reject(new Error("HLS read was cancelled."));
  }
  if (!delay) return Promise.resolve();

  let abort: (() => void) | undefined;
  const delayPromise = Promise.resolve(delay()).then(() => {
    if (signal?.aborted) throw new Error("HLS read was cancelled.");
  });
  if (!signal) return delayPromise;

  const abortPromise = new Promise<never>((_, reject) => {
    abort = () => reject(new Error("HLS read was cancelled."));
    signal.addEventListener("abort", abort, { once: true });
  });

  return Promise.race([delayPromise, abortPromise]).finally(() => {
    if (abort) signal.removeEventListener("abort", abort);
  });
}

function removePendingSegmentLoadWaiter(
  pending: PendingSegmentLoad,
  waiter: PendingSegmentLoadWaiter,
) {
  if (waiter.signal && waiter.abort) {
    waiter.signal.removeEventListener("abort", waiter.abort);
  }
  pending.waiters.delete(waiter);
  if (
    waiter.aborted &&
    pending.waiters.size === 0 &&
    !pending.controller.signal.aborted
  ) {
    pending.controller.abort();
  }
}

function waitForPendingSegmentLoad(
  pending: PendingSegmentLoad,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return Promise.resolve(null);

  const waiter: PendingSegmentLoadWaiter = {
    signal,
    aborted: false,
  };
  pending.waiters.add(waiter);

  if (!signal) {
    return pending.promise.finally(() => {
      removePendingSegmentLoadWaiter(pending, waiter);
    });
  }

  const abort = new Promise<null>((resolve) => {
    waiter.abort = () => {
      waiter.aborted = true;
      removePendingSegmentLoadWaiter(pending, waiter);
      resolve(null);
    };
    signal.addEventListener("abort", waiter.abort, { once: true });
  });

  return Promise.race([pending.promise, abort]).finally(() => {
    removePendingSegmentLoadWaiter(pending, waiter);
  });
}

async function coalescedHlsSegmentPayload(
  playlistPath: string,
  segment: string,
  signal?: AbortSignal,
) {
  const key = segmentLoadKey(playlistPath, segment);
  const existing = pendingSegmentLoads.get(key);
  if (existing) return waitForPendingSegmentLoad(existing, signal);

  const controller = new AbortController();
  const pending: PendingSegmentLoad = {
    controller,
    promise: loadHlsSegmentPayload(playlistPath, segment, controller.signal),
    waiters: new Set(),
  };
  pendingSegmentLoads.set(key, pending);
  pending.promise
    .finally(() => {
      if (pendingSegmentLoads.get(key) === pending)
        pendingSegmentLoads.delete(key);
    })
    .catch(() => undefined);
  return waitForPendingSegmentLoad(pending, signal);
}

export function resetHlsSegmentLoadStateForTests() {
  pendingSegmentLoads.clear();
  headResponseDelayForTests = null;
  playlistReadDelayForTests = null;
  segmentReadCountForTests = 0;
  segmentReadDelayForTests = null;
}

export function hlsSegmentReadCountForTests() {
  return segmentReadCountForTests;
}

export function setHlsSegmentReadDelayForTests(
  delay: (() => Promise<void> | void) | null,
) {
  segmentReadDelayForTests = delay;
}

export function setHlsPlaylistReadDelayForTests(
  delay: (() => Promise<void> | void) | null,
) {
  playlistReadDelayForTests = delay;
}

export function setHlsHeadResponseDelayForTests(
  delay: (() => Promise<void> | void) | null,
) {
  headResponseDelayForTests = delay;
}

export function rewriteHlsPlaylistUris(playlist: string, playlistPath: string) {
  const playlistDirectory = path.dirname(playlistPath);
  return playlist
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#EXT-X-MAP:")) {
        return rewriteHlsTagUri(line, playlistDirectory);
      }
      if (trimmed.startsWith("#")) return line;

      const segmentName = hlsPlaylistSegmentName(trimmed, playlistDirectory);
      if (segmentName) return `${SEGMENT_ROUTE_PREFIX}${segmentName}`;

      return line;
    })
    .join("\n");
}

function rewriteHlsTagUri(line: string, playlistDirectory: string) {
  return line.replace(/URI="([^"]+)"/g, (match, uri: string) => {
    const segmentName = hlsPlaylistSegmentName(uri, playlistDirectory);
    if (!segmentName) return match;
    return `URI="${SEGMENT_ROUTE_PREFIX}${segmentName}"`;
  });
}

function hlsPlaylistSegmentName(uri: string, playlistDirectory: string) {
  if (uri.startsWith(SEGMENT_ROUTE_PREFIX)) {
    const segmentName = uri
      .slice(SEGMENT_ROUTE_PREFIX.length)
      .split(/[?#]/, 1)[0];
    return isSafeHlsSegmentName(segmentName) ? segmentName : null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) {
    try {
      const segmentName = path.basename(new URL(uri).pathname);
      return isSafeHlsSegmentName(segmentName) ? segmentName : null;
    } catch {
      return null;
    }
  }

  if (uri.startsWith("/")) {
    const segmentName = path.basename(uri.split(/[?#]/, 1)[0]);
    return isSafeHlsSegmentName(segmentName) ? segmentName : null;
  }

  const resolved = path.resolve(playlistDirectory, uri.split(/[?#]/, 1)[0]);
  const relative = path.relative(playlistDirectory, resolved);
  if (
    relative.length === 0 ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return null;
  }

  const segmentName = path.basename(resolved);
  return isSafeHlsSegmentName(segmentName) ? segmentName : null;
}

export async function hlsPlaylistResponse(
  playlistPath: string,
  options: HlsReadOptions = {},
) {
  const body = await hlsPlaylistBody(playlistPath, options);
  await waitForMaybeDelayedRead(playlistReadDelayForTests, options.signal);
  return new Response(body, {
    headers: {
      "content-type": `${PLAYLIST_MIME_TYPE}; charset=utf-8`,
      "cache-control": "no-store",
    },
  });
}

async function hlsPlaylistBody(
  playlistPath: string,
  options: HlsReadOptions = {},
) {
  return rewriteHlsPlaylistUris(
    await readFile(playlistPath, { encoding: "utf8", signal: options.signal }),
    playlistPath,
  );
}

export async function hlsPlaylistHeadResponse(
  playlistPath: string,
  options: HlsReadOptions = {},
) {
  let details;
  try {
    details = await stat(playlistPath);
  } catch {
    return new Response(null, { status: 404 });
  }
  if (!details.isFile() || details.size <= 0) {
    return new Response(null, { status: 404 });
  }

  let body;
  try {
    body = await hlsPlaylistBody(playlistPath, options);
  } catch {
    return new Response(null, { status: 404 });
  }
  if (body.length === 0) return new Response(null, { status: 404 });

  await waitForMaybeDelayedRead(headResponseDelayForTests, options.signal);
  return new Response(null, {
    headers: {
      "content-type": `${PLAYLIST_MIME_TYPE}; charset=utf-8`,
      "content-length": String(Buffer.byteLength(body)),
      "cache-control": "no-store",
    },
  });
}

export async function hlsPlaylistFileExists(playlistPath: string) {
  try {
    const details = await stat(playlistPath);
    return details.isFile() && details.size > 0;
  } catch {
    return false;
  }
}

export function hlsPlaylistType(playlist: string) {
  for (const line of playlist.split("\n")) {
    const match = /^#EXT-X-PLAYLIST-TYPE:([A-Z]+)\s*$/i.exec(line.trim());
    if (match) return match[1]?.toUpperCase() ?? null;
  }
  return null;
}

export function hlsPlaylistSegmentEntries(
  playlist: string,
  playlistPath: string,
): HlsPlaylistSegmentEntry[] {
  const playlistDirectory = path.dirname(playlistPath);
  const entries: HlsPlaylistSegmentEntry[] = [];
  let mediaSequence = 0;
  let pendingDuration: number | null = null;
  let startSeconds = 0;

  for (const line of playlist.split("\n")) {
    const trimmed = line.trim();
    const mediaSequenceMatch = /^#EXT-X-MEDIA-SEQUENCE:(\d+)\s*$/.exec(
      trimmed,
    );
    if (mediaSequenceMatch) {
      mediaSequence = Number.parseInt(mediaSequenceMatch[1] ?? "0", 10);
      continue;
    }

    const durationMatch = /^#EXTINF:([0-9]+(?:\.[0-9]+)?)/.exec(trimmed);
    if (durationMatch) {
      const duration = Number.parseFloat(durationMatch[1] ?? "");
      pendingDuration =
        Number.isFinite(duration) && duration > 0 ? duration : null;
      continue;
    }

    if (!trimmed || trimmed.startsWith("#")) continue;
    const segmentName = hlsPlaylistSegmentName(trimmed, playlistDirectory);
    if (!segmentName || pendingDuration === null) continue;

    entries.push({
      segment: segmentName,
      segmentIndex: hlsSegmentIndex(segmentName),
      durationSeconds: pendingDuration,
      sequenceNumber: mediaSequence + entries.length,
      startSeconds,
    });
    startSeconds += pendingDuration;
    pendingDuration = null;
  }

  return entries;
}

export function hlsEventPlaylistContainsSegment(input: {
  playlist: string;
  playlistPath: string;
  segment: string;
}) {
  if (hlsPlaylistType(input.playlist) !== "EVENT") return false;
  return hlsPlaylistSegmentEntries(input.playlist, input.playlistPath).some(
    (entry) => entry.segment === input.segment,
  );
}

export async function hlsEventPlaylistHasSegment(
  playlistPath: string,
  segment: string,
  options: HlsReadOptions = {},
) {
  try {
    return hlsEventPlaylistContainsSegment({
      playlist: await readFile(playlistPath, {
        encoding: "utf8",
        signal: options.signal,
      }),
      playlistPath,
      segment,
    });
  } catch {
    return false;
  }
}

export function hlsPlaylistBodySegmentFormat(
  playlist: string,
): HlsSegmentFormat {
  for (const line of playlist.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#EXT-X-MAP:")) return "fmp4";
    if (trimmed.startsWith("#")) continue;

    const segmentPath = trimmed.split(/[?#]/, 1)[0] ?? "";
    const extension = path.extname(segmentPath).toLowerCase();
    if (extension === ".m4s" || extension === ".cmfv") return "fmp4";
  }
  return "mpegts";
}

export async function hlsPlaylistSegmentFormat(
  playlistPath: string,
  options: HlsReadOptions = {},
): Promise<HlsSegmentFormat> {
  try {
    return hlsPlaylistBodySegmentFormat(
      await readFile(playlistPath, {
        encoding: "utf8",
        signal: options.signal,
      }),
    );
  } catch {
    return "mpegts";
  }
}

export function virtualHlsPlaylist(input: {
  durationSeconds: number;
  startTimeSeconds?: number | null;
  segmentSeconds?: number | null;
  segmentFormat?: HlsSegmentFormat;
}) {
  const segmentSeconds =
    Number.isFinite(input.segmentSeconds) && Number(input.segmentSeconds) > 0
      ? Number(input.segmentSeconds)
      : DEFAULT_HLS_SEGMENT_SECONDS;
  const durationSeconds = Math.max(0, Number(input.durationSeconds));
  const startTimeSeconds =
    Number.isFinite(input.startTimeSeconds) &&
    Number(input.startTimeSeconds) > 0
      ? Number(input.startTimeSeconds)
      : 0;
  const remainingSeconds = Math.max(0, durationSeconds - startTimeSeconds);
  const segmentCount = Math.ceil(remainingSeconds / segmentSeconds);
  const segmentFormat = input.segmentFormat ?? "mpegts";
  const lines = [
    "#EXTM3U",
    `#EXT-X-VERSION:${segmentFormat === "fmp4" ? "7" : "3"}`,
    `#EXT-X-TARGETDURATION:${Math.ceil(segmentSeconds)}`,
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-MEDIA-SEQUENCE:0",
  ];
  if (segmentFormat === "fmp4") {
    lines.push(`#EXT-X-MAP:URI="${SEGMENT_ROUTE_PREFIX}init.mp4"`);
  }

  for (let index = 0; index < segmentCount; index += 1) {
    const segmentDuration =
      index === segmentCount - 1
        ? remainingSeconds - segmentSeconds * index
        : segmentSeconds;
    lines.push(`#EXTINF:${segmentDuration.toFixed(3)},`);
    lines.push(
      `${SEGMENT_ROUTE_PREFIX}${hlsSegmentName(index, segmentFormat)}`,
    );
  }

  lines.push("#EXT-X-ENDLIST");
  return `${lines.join("\n")}\n`;
}

export function virtualHlsPlaylistResponse(input: {
  durationSeconds: number;
  startTimeSeconds?: number | null;
  segmentSeconds?: number | null;
  segmentFormat?: HlsSegmentFormat;
}) {
  return new Response(virtualHlsPlaylist(input), {
    headers: {
      "content-type": `${PLAYLIST_MIME_TYPE}; charset=utf-8`,
      "cache-control": "no-store",
    },
  });
}

export function virtualHlsPlaylistHeadResponse() {
  return new Response(null, {
    headers: {
      "content-type": `${PLAYLIST_MIME_TYPE}; charset=utf-8`,
      "cache-control": "no-store",
    },
  });
}

export async function hlsSegmentResponse(
  playlistPath: string,
  segment: string,
  options: HlsReadOptions = {},
) {
  if (!isSafeHlsSegmentName(segment)) {
    return new Response("Invalid segment.", { status: 400 });
  }

  const payload = await coalescedHlsSegmentPayload(
    playlistPath,
    segment,
    options.signal,
  );
  if (!payload) return new Response("Not found.", { status: 404 });
  if (payload.size <= 0) return new Response("Not found.", { status: 404 });

  return new Response(payload.body as unknown as BodyInit, {
    headers: {
      "content-type": payload.mimeType,
      "content-length": String(payload.size),
      "cache-control": "no-store",
    },
  });
}

export async function hlsSegmentHeadResponse(
  playlistPath: string,
  segment: string,
  options: HlsReadOptions = {},
) {
  if (!isSafeHlsSegmentName(segment)) {
    return new Response(null, { status: 400 });
  }

  const segmentPath = path.join(path.dirname(playlistPath), segment);
  let details;
  try {
    details = await stat(segmentPath);
  } catch {
    return new Response(null, { status: 404 });
  }
  if (!details.isFile() || details.size <= 0) {
    return new Response(null, { status: 404 });
  }

  await waitForMaybeDelayedRead(headResponseDelayForTests, options.signal);
  return new Response(null, {
    headers: {
      "content-type": hlsSegmentMimeType(segment),
      "content-length": String(details.size),
      "cache-control": "no-store",
    },
  });
}

export async function hlsSegmentFileExists(
  playlistPath: string,
  segment: string,
) {
  if (!isSafeHlsSegmentName(segment)) return false;
  try {
    const details = await stat(path.join(path.dirname(playlistPath), segment));
    return details.isFile() && details.size > 0;
  } catch {
    return false;
  }
}

export async function pruneHlsSegmentsBehind(
  playlistPath: string,
  currentSegment: string,
  keepBehind = DEFAULT_SEGMENT_KEEP_BEHIND,
) {
  const currentIndex = hlsSegmentIndex(currentSegment);
  if (currentIndex === null) return 0;

  const pruneBefore = currentIndex - Math.max(0, keepBehind);
  if (pruneBefore <= 0) return 0;

  const playlistDirectory = path.dirname(playlistPath);
  const entries = await readdir(playlistDirectory, { withFileTypes: true });
  let removed = 0;

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile() || !canPruneSegment(entry.name)) return;
      const segmentIndex = hlsSegmentIndex(entry.name);
      if (segmentIndex === null || segmentIndex >= pruneBefore) return;
      await rm(path.join(playlistDirectory, entry.name), { force: true });
      removed += 1;
    }),
  );

  return removed;
}
