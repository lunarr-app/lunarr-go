import { open } from "node:fs/promises";
import type { ProbeInput, SeekableTranscodeInputSource } from "./backend";

/**
 * Minimal byte-range reader used by the keyframe extractor. Implementations:
 * - {@link createLocalByteRangeReader} wraps a local file handle.
 * - {@link createSeekableByteRangeReader} adapts a {@link SeekableTranscodeInputSource}
 *   for remote WebDAV / SFTP files.
 */
export type ByteRangeReader = {
  readonly sizeBytes: number;
  read(start: number, length: number, signal?: AbortSignal): Promise<Uint8Array>;
  close(): Promise<void>;
};

export async function createLocalByteRangeReader(filePath: string): Promise<ByteRangeReader> {
  const handle = await open(filePath, "r");
  const stat = await handle.stat();
  const sizeBytes = stat.size;
  return {
    sizeBytes,
    async read(start, length, signal) {
      if (start < 0 || length <= 0 || start >= sizeBytes) return new Uint8Array(0);
      const safeLength = Math.min(length, sizeBytes - start);
      const buf = Buffer.alloc(safeLength);
      const { bytesRead } = await handle.read(buf, 0, safeLength, start);
      if (signal?.aborted) throw new Error("Local byte-range read was aborted.");
      return buf.subarray(0, bytesRead);
    },
    close: () => handle.close(),
  };
}

export function createSeekableByteRangeReader(source: SeekableTranscodeInputSource): ByteRangeReader {
  return {
    get sizeBytes() {
      return source.sizeBytes;
    },
    async read(start, length, signal) {
      const chunk = await source.read(start, length, signal);
      // The seekable source returns Buffer (Uint8Array-compatible); normalise to Uint8Array.
      return chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    },
    close: () => source.close(),
  };
}

type Mp4Box = {
  type: string;
  offset: number;
  size: number;
  headerSize: number;
  dataStart: number;
  dataEnd: number;
};

function readBoxHeader(view: DataView, offset: number): { type: string; size: number; headerSize: number } | null {
  if (offset + 8 > view.byteLength) return null;
  const size = view.getUint32(offset);
  const type = String.fromCharCode(
    view.getUint8(offset + 4),
    view.getUint8(offset + 5),
    view.getUint8(offset + 6),
    view.getUint8(offset + 7),
  );
  let headerSize = 8;
  let realSize = size;
  if (size === 1) {
    // 64-bit extended size
    if (offset + 16 > view.byteLength) return null;
    realSize = Number(view.getBigUint64(offset + 8));
    headerSize = 16;
  } else if (size === 0) {
    // box extends to end of buffer
    realSize = view.byteLength - offset;
  }
  return { type, size: realSize, headerSize };
}

function findTopLevelBoxByType(buffer: ArrayBuffer, type: string): Mp4Box | null {
  const view = new DataView(buffer);
  const end = view.byteLength;
  let offset = 0;
  while (offset + 8 <= end) {
    const header = readBoxHeader(view, offset);
    if (!header) break;
    if (header.size < header.headerSize) break;
    const next = offset + header.size;
    if (header.type === type) {
      return {
        type,
        offset,
        size: header.size,
        headerSize: header.headerSize,
        dataStart: offset + header.headerSize,
        dataEnd: next,
      };
    }
    offset = next;
  }
  return null;
}

function findChildBoxByPath(buffer: ArrayBuffer, root: Mp4Box, path: string[]): Mp4Box | null {
  let curStart = root.dataStart;
  let curEnd = root.dataEnd;
  const view = new DataView(buffer);
  for (const want of path) {
    let found: Mp4Box | null = null;
    let offset = curStart;
    while (offset + 8 <= curEnd) {
      const header = readBoxHeader(view, offset);
      if (!header) break;
      if (header.size < header.headerSize) break;
      const next = offset + header.size;
      if (next > curEnd) break;
      if (header.type === want) {
        found = {
          type: header.type,
          offset,
          size: header.size,
          headerSize: header.headerSize,
          dataStart: offset + header.headerSize,
          dataEnd: next,
        };
        break;
      }
      offset = next;
    }
    if (!found) return null;
    curStart = found.dataStart;
    curEnd = found.dataEnd;
  }
  return {
    type: path[path.length - 1],
    offset: curStart,
    size: curEnd - curStart,
    headerSize: 0,
    dataStart: curStart,
    dataEnd: curEnd,
  };
}

/**
 * Extract keyframe timestamps for an mp4 file by parsing its moov atom directly
 * via byte-range reads. This avoids demuxer packet iteration which is far too
 * slow over high-latency remote storage (a 734MB file would otherwise take
 * ~55min via 22k 32KB HTTP range requests).
 *
 * Strategy:
 * 1. Fetch the first 4KB to detect an `ftyp` box and discover the moov atom's
 *    declared size. If moov lives at the start (faststart mp4), fetch exactly
 *    the moov region and parse `trak/mdia/minf/stbl/{stts,stss}` in memory.
 * 2. If moov is not found in the head, fall back to scanning the last ~8MB
 *    for the `moov` type magic.
 *
 * Returns null on any error, for files that aren't valid mp4, or for mp4
 * variants without a sync sample table (every-frame-keyframe).
 */
export async function extractKeyframeTimesFromMp4(
  reader: ByteRangeReader,
  signal?: AbortSignal,
): Promise<number[] | null> {
  if (signal?.aborted) return null;
  if (reader.sizeBytes < 16) return null;

  // 1) Fetch the first 4KB to detect ftyp and discover moov size.
  const headSize = Math.min(4096, reader.sizeBytes);
  const head = await reader.read(0, headSize, signal);
  const headBuf = head.buffer.slice(head.byteOffset, head.byteOffset + head.byteLength) as ArrayBuffer;
  // Reject obvious non-mp4 files early.
  const ftyp = findTopLevelBoxByType(headBuf, "ftyp");
  if (!ftyp) return null;

  let moovBox: Mp4Box | null = null;
  const headView = new DataView(headBuf);
  // Walk top-level boxes — find 'moov' even if its declared size is truncated by the fetched head.
  let offset = 0;
  while (offset + 8 <= headView.byteLength) {
    const header = readBoxHeader(headView, offset);
    if (!header) break;
    if (header.size < header.headerSize) break;
    if (header.type === "moov") {
      moovBox = {
        type: "moov",
        offset,
        size: header.size,
        headerSize: header.headerSize,
        dataStart: offset + header.headerSize,
        dataEnd: Math.min(offset + header.size, headView.byteLength),
      };
      break;
    }
    offset += header.size;
  }

  let moovBuffer: ArrayBuffer;
  if (moovBox && moovBox.dataEnd - moovBox.offset >= moovBox.size) {
    // moov fully contained in the head — parse in place.
    moovBuffer = headBuf;
  } else if (moovBox && moovBox.size <= reader.sizeBytes) {
    // moov header was found in head, but its body extends further — fetch the full atom.
    const size = moovBox.size;
    const fetched = await reader.read(0, size, signal);
    moovBuffer = fetched.buffer.slice(fetched.byteOffset, fetched.byteOffset + fetched.byteLength) as ArrayBuffer;
    moovBox = findTopLevelBoxByType(moovBuffer, "moov");
    if (!moovBox) return null;
  } else {
    // moov not at start — scan the tail for the `moov` magic.
    const tailBuffer = await fetchTailAndScanForMoov(reader, signal);
    if (!tailBuffer) return null;
    moovBuffer = tailBuffer;
    moovBox = findTopLevelBoxByType(moovBuffer, "moov");
    if (!moovBox) return null;
  }

  return parseKeyframeTimesFromMoov(moovBuffer, moovBox);
}

async function fetchTailAndScanForMoov(reader: ByteRangeReader, signal?: AbortSignal): Promise<ArrayBuffer | null> {
  const TAIL_BYTES = 8_388_608; // 8MB — covers typical moov-at-end sizes
  const start = Math.max(0, reader.sizeBytes - TAIL_BYTES);
  const length = reader.sizeBytes - start;
  if (length < 16) return null;
  const tail = await reader.read(start, length, signal);
  const u8 = tail instanceof Uint8Array ? tail : new Uint8Array(tail);
  // Look for 'moov' magic (0x6d 0x6f 0x6f 0x76) preceded by an 8-byte header.
  for (let i = 4; i < u8.length - 4; i++) {
    if (u8[i] === 0x6d && u8[i + 1] === 0x6f && u8[i + 2] === 0x6f && u8[i + 3] === 0x76) {
      // The moov header starts 4 bytes before (size:4) the type.
      const headerStart = i - 4;
      if (headerStart < 0) continue;
      const buf = u8.buffer.slice(u8.byteOffset + headerStart, u8.byteOffset + u8.length) as ArrayBuffer;
      return buf;
    }
  }
  return null;
}

function parseKeyframeTimesFromMoov(moovBuffer: ArrayBuffer, moovBox: Mp4Box): number[] | null {
  // Find the first video trak. mp4's trak ordering is conventionally
  // video-first; mp4 spec doesn't strictly require it, but in practice
  // almost every file follows it. If we land on a non-video trak, stss will
  // simply be absent and we'll bail.
  const trak = findChildBoxByPath(moovBuffer, moovBox, ["trak"]);
  if (!trak) return null;

  const mdia = findChildBoxByPath(moovBuffer, trak, ["mdia"]);
  if (!mdia) return null;

  // mdhd gives us timescale
  const mdhd = findChildBoxByPath(moovBuffer, mdia, ["mdhd"]);
  if (!mdhd) return null;
  const timescale = parseMdhdTimescale(moovBuffer, mdhd);
  if (!timescale || timescale <= 0) return null;

  const minf = findChildBoxByPath(moovBuffer, mdia, ["minf"]);
  if (!minf) return null;
  const stbl = findChildBoxByPath(moovBuffer, minf, ["stbl"]);
  if (!stbl) return null;

  const stts = findChildBoxByPath(moovBuffer, stbl, ["stts"]);
  if (!stts) return null;
  const sttsEntries = parseStts(moovBuffer, stts);
  if (sttsEntries.length === 0) return null;

  const stss = findChildBoxByPath(moovBuffer, stbl, ["stss"]);
  if (!stss) {
    // No sync sample table means every sample is a keyframe. We still want
    // segment boundaries at 16s intervals, so emit cumulative PTS for each
    // sample and let the caller's segmentDurationsFromKeyframes grid pick
    // 16s-spaced boundaries. For typical files this is far too many entries
    // to be useful — bail and let the fixed-grid playlist handle it.
    return null;
  }
  const syncSamples = parseStss(moovBuffer, stss);
  if (syncSamples.length === 0) return null;

  // Map sync-sample numbers → cumulative decode time (in timescale units).
  const keyframeTimes: number[] = [];
  for (const sampleNum of syncSamples) {
    const idx = sampleNum - 1; // stss sample numbers are 1-indexed
    if (idx < 0 || idx >= sttsEntries.length) continue;
    const cumulativeDelta = sttsEntries[idx].cumulativeDelta;
    const seconds = cumulativeDelta / timescale;
    if (Number.isFinite(seconds) && seconds >= 0) {
      keyframeTimes.push(seconds);
    }
  }
  return keyframeTimes.length > 0 ? keyframeTimes : null;
}

function parseMdhdTimescale(buffer: ArrayBuffer, mdhd: Mp4Box): number | null {
  const view = new DataView(buffer);
  if (mdhd.dataStart + 4 > mdhd.dataEnd) return null;
  const version = view.getUint8(mdhd.dataStart);
  if (version === 0) {
    // 4 v+f + 4 creation + 4 modification + 4 timescale + 4 duration = 20 bytes
    if (mdhd.dataStart + 16 > mdhd.dataEnd) return null;
    return view.getUint32(mdhd.dataStart + 12);
  }
  if (version === 1) {
    // 4 v+f + 8 creation + 8 modification + 4 timescale + 8 duration = 32 bytes
    if (mdhd.dataStart + 24 > mdhd.dataEnd) return null;
    return view.getUint32(mdhd.dataStart + 20);
  }
  return null;
}

function parseStts(buffer: ArrayBuffer, stts: Mp4Box): Array<{ sampleNum: number; cumulativeDelta: number }> {
  const view = new DataView(buffer);
  if (stts.dataStart + 8 > stts.dataEnd) return [];
  const entryCount = view.getUint32(stts.dataStart + 4);
  const entries: Array<{ sampleNum: number; cumulativeDelta: number }> = [];
  let sampleNum = 1;
  let cumulativeDelta = 0;
  const maxEntries = Math.floor((stts.dataEnd - (stts.dataStart + 8)) / 8);
  const count = Math.min(entryCount, maxEntries);
  for (let i = 0; i < count; i++) {
    const entryOffset = stts.dataStart + 8 + i * 8;
    if (entryOffset + 8 > stts.dataEnd) break;
    const sampleCount = view.getUint32(entryOffset);
    const sampleDelta = view.getUint32(entryOffset + 4);
    if (sampleDelta === 0 && sampleCount > 1) {
      // Degenerate entry — bail to prevent infinite-time keyframe artifacts.
      break;
    }
    for (let j = 0; j < sampleCount; j++) {
      entries.push({ sampleNum, cumulativeDelta });
      cumulativeDelta += sampleDelta;
      sampleNum += 1;
      // Stts tables can be very large for long mp4s (millions of entries).
      // We only need it to look up sync samples, so cap memory.
      if (entries.length > 5_000_000) return entries;
    }
  }
  return entries;
}

function parseStss(buffer: ArrayBuffer, stss: Mp4Box): number[] {
  const view = new DataView(buffer);
  if (stss.dataStart + 8 > stss.dataEnd) return [];
  const entryCount = view.getUint32(stss.dataStart + 4);
  const samples: number[] = [];
  const maxEntries = Math.floor((stss.dataEnd - (stss.dataStart + 8)) / 4);
  const count = Math.min(entryCount, maxEntries);
  for (let i = 0; i < count; i++) {
    const offset = stss.dataStart + 8 + i * 4;
    if (offset + 4 > stss.dataEnd) break;
    samples.push(view.getUint32(offset));
  }
  return samples;
}

/**
 * Probe signature shared with the old node-av extractor. Adapts a {@link ProbeInput}
 * into a {@link ByteRangeReader} (local file or remote seekable source) and
 * delegates to {@link extractKeyframeTimesFromMp4}. Returns null for non-mp4
 * sources (no ftyp box), remote sources without an inputSource, or any error.
 */
export type ProbeKeyframesFn = (input: ProbeInput) => Promise<number[] | null>;

export const probeMp4Keyframes: ProbeKeyframesFn = async (input) => {
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
    return await extractKeyframeTimesFromMp4(reader, input.signal);
  } catch {
    return null;
  } finally {
    await reader.close().catch(() => undefined);
  }
};
