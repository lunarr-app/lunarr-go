import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NodeAvInputFormat } from "./container-format";
import type { SeekableTranscodeInputSource } from "./backend";
import { withTimeout } from "../timeout";

const KEYFRAMES_FILENAME = "keyframes.json";
const DEFAULT_KEYFRAME_SCAN_TIMEOUT_MS = 8_000;

export type KeyframeTimes = number[];

export type KeyframeExtractorDeps = {
  probeKeyframes: (input: {
    mediaFileId: string;
    path: string;
    inputSource?: SeekableTranscodeInputSource;
    signal?: AbortSignal;
  }) => Promise<KeyframeTimes | null>;
};

export function keyframeCachePath(cacheDir: string): string {
  return path.join(cacheDir, KEYFRAMES_FILENAME);
}

export async function readKeyframeCache(cacheDir: string): Promise<KeyframeTimes | null> {
  let raw: string;
  try {
    raw = await readFile(keyframeCachePath(cacheDir), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { keyframeTimes?: unknown };
    if (!Array.isArray(parsed.keyframeTimes)) return null;
    const times = parsed.keyframeTimes.filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0,
    );
    return times.length > 0 ? times : null;
  } catch {
    return null;
  }
}

export async function writeKeyframeCache(cacheDir: string, times: KeyframeTimes): Promise<void> {
  try {
    await writeFile(keyframeCachePath(cacheDir), JSON.stringify({ keyframeTimes: times }));
  } catch {
    // best-effort persistence; callers fall back to live scanning on miss
  }
}

type KeyframeScanStrategy = "scan" | "skip";

/**
 * Maps a resolved node-av input format to whether cheap keyframe iteration is
 * worth attempting. `mp4`/`webm`/`matroska` are generally index-bearing and
 * safe to scan; `avi` and `mpegts` lack random-access sync tables so we treat
 * them as unsupported and let the caller fall back to transcode.
 */
export function keyframeScanStrategyForFormat(format: NodeAvInputFormat | null | undefined): KeyframeScanStrategy {
  if (!format) return "skip";
  switch (format) {
    case "mp4":
    case "webm":
    case "matroska":
      return "scan";
    case "avi":
    case "mpegts":
      return "skip";
  }
}

export async function extractKeyframeTimes(
  deps: KeyframeExtractorDeps,
  input: {
    mediaFileId: string;
    filePath: string;
    inputSource?: SeekableTranscodeInputSource;
    format: NodeAvInputFormat | null;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<KeyframeTimes | null> {
  if (keyframeScanStrategyForFormat(input.format) === "skip") {
    console.warn(`Keyframe extraction skipped (format=${input.format ?? "null"}) for ${input.filePath}`);
    return null;
  }

  const controller = new AbortController();
  const linkAbort = () => controller.abort();
  if (input.signal) {
    if (input.signal.aborted) {
      controller.abort();
    } else {
      input.signal.addEventListener("abort", linkAbort, { once: true });
    }
  }

  const timeoutMs = Math.max(1, Math.floor(input.timeoutMs ?? DEFAULT_KEYFRAME_SCAN_TIMEOUT_MS));
  try {
    const result = await withTimeout(
      deps.probeKeyframes({
        mediaFileId: input.mediaFileId,
        path: input.filePath,
        inputSource: input.inputSource,
        signal: controller.signal,
      }),
      timeoutMs,
      `Keyframe extraction for ${input.filePath}`,
      {
        onTimeout: () => controller.abort(),
        onLateResolve: () => undefined,
        signal: controller.signal,
        abortMessage: "Keyframe extraction was aborted.",
      },
    );
    if (result === null || result.length === 0) {
      console.warn(`Keyframe extraction returned no keyframes for ${input.filePath}`);
    }
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`Keyframe extraction failed for ${input.filePath}: ${reason}`);
    return null;
  } finally {
    if (input.signal) input.signal.removeEventListener("abort", linkAbort);
  }
}
