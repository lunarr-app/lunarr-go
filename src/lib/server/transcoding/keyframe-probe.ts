import {
  createLocalByteRangeReader,
  createSeekableByteRangeReader,
  probeMp4Keyframes,
  type ByteRangeReader,
  type ProbeKeyframesFn,
} from "./mp4-stss";
import { extractKeyframeTimesFromMkv } from "./mkv-cues";

export type { ProbeKeyframesFn };

/**
 * Probe adapter for Matroska/mkv files: creates a ByteRangeReader from the
 * input source and delegates to {@link extractKeyframeTimesFromMkv}.
 * Returns null for non-mkv files (no EBML header), remote sources without an
 * inputSource, or any error.
 */
export const probeMkvKeyframes: ProbeKeyframesFn = async (input) => {
  if (input.signal?.aborted) return null;
  let reader: ByteRangeReader;
  if (input.inputSource) {
    reader = createSeekableByteRangeReader(input.inputSource);
  } else if (input.path) {
    try {
      reader = await createLocalByteRangeReader(input.path);
    } catch {
      return null;
    }
  } else {
    return null;
  }
  try {
    return await extractKeyframeTimesFromMkv(reader, input.signal);
  } catch {
    return null;
  } finally {
    await reader.close().catch(() => undefined);
  }
};

/**
 * Combined keyframe probe: tries the mp4 stss parser first (returns null for
 * non-mp4 files via ftyp detection), then falls back to the Matroska Cues
 * parser (returns null for non-mkv files via EBML header detection).
 *
 * Each parser creates its own ByteRangeReader from the input source, so the
 * losing parser wastes at most one range read (typically 4–64 KB) before
 * bailing. For remote files the seekable input source is reused — no extra
 * connection overhead.
 */
export const probeKeyframes: ProbeKeyframesFn = async (input) => {
  const mp4Result = await probeMp4Keyframes(input);
  if (mp4Result !== null) return mp4Result;
  return probeMkvKeyframes(input);
};
