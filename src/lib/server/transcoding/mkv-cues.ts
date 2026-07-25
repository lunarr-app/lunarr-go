import type { ByteRangeReader } from "./mp4-stss";

// ─── Matroska/EBML element IDs ────────────────────────────────────────────────

const ID_EBML = 0x1a45dfa3;
const ID_SEGMENT = 0x18538067;
const ID_SEEK_HEAD = 0x114d9b74;
const ID_SEEK = 0x4dbb;
const ID_SEEK_ID = 0x53ab;
const ID_SEEK_POSITION = 0x53ac;
const ID_INFO = 0x1549a966;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_CUES = 0x1c53bb6b;
const ID_CUE_POINT = 0xbb;
const ID_CUE_TIME = 0xb3;

// ─── EBML VINT reader ──────────────────────────────────────────────────────────

type VintResult = { value: number; bytesConsumed: number };

/**
 * Reads an EBML variable-size integer from a DataView at the given offset.
 * Returns null if the buffer is too short or the encoding is invalid (zero
 * length). The marker bit is stripped — the returned `value` is the payload.
 */
function readEbmlVint(view: DataView, offset: number): VintResult | null {
  if (offset >= view.byteLength) return null;
  const firstByte = view.getUint8(offset);
  if (firstByte === 0) return null;

  let length = 1;
  let marker = 0x80;
  while ((firstByte & marker) === 0) {
    marker >>= 1;
    length++;
    if (length > 8) return null;
  }

  if (offset + length > view.byteLength) return null;

  // Mask out the marker bit.
  let value = firstByte & (marker - 1);
  for (let i = 1; i < length; i++) {
    value = (value << 8) | view.getUint8(offset + i);
  }
  return { value, bytesConsumed: length };
}

/**
 * Reads the raw element ID bytes (including the VINT marker) as an unsigned
 * integer. This is distinct from {@link readEbmlVint} which strips the marker
 * from sizes.
 */
function readElementId(view: DataView, offset: number): VintResult | null {
  const vint = readEbmlVint(view, offset);
  if (!vint) return null;
  // Reconstruct the full ID including the marker bit.
  let id = 0;
  for (let i = 0; i < vint.bytesConsumed; i++) {
    id = (id << 8) | view.getUint8(offset + i);
  }
  return { value: id, bytesConsumed: vint.bytesConsumed };
}

// ─── EBML element walker ──────────────────────────────────────────────────────

type EbmlElement = {
  id: number;
  dataStart: number;
  dataSize: number;
  headerSize: number;
};

/**
 * Reads the next EBML element header (ID + size) at the given offset within
 * a DataView. Returns null if there isn't enough data.
 */
function readElementHeader(view: DataView, offset: number): (EbmlElement & { bytesConsumed: number }) | null {
  const idResult = readElementId(view, offset);
  if (!idResult) return null;

  const sizeOffset = offset + idResult.bytesConsumed;
  const sizeResult = readEbmlVint(view, sizeOffset);
  if (!sizeResult) return null;

  const headerSize = idResult.bytesConsumed + sizeResult.bytesConsumed;
  const dataSize = sizeResult.value;
  const dataStart = offset + headerSize;

  return {
    id: idResult.value,
    dataStart,
    dataSize,
    headerSize,
    bytesConsumed: headerSize,
  };
}

// ─── SeekHead / Cues locator ───────────────────────────────────────────────────

type SeekEntry = {
  elementId: number;
  position: number;
};

/**
 * Open-ended size sentinel: EBML uses all-1s in the VINT payload to signal
 * "unknown size", which is common for the Segment element in streaming mode.
 */
function isUnknownSize(size: number): boolean {
  // All-1s payloads for 1-8 byte VINTs.
  return (
    size === 0x7f ||
    size === 0x3fff ||
    size === 0x1fffff ||
    size === 0xfffffff ||
    size === 0x7ffffffff ||
    size === 0x3fffffffff ||
    size === 0x1ffffffffffff ||
    size === 0xffffffffffffff
  );
}

/**
 * Parse a SeekHead element's children, collecting Seek entries that map
 * element IDs → positions (relative to the Segment data start).
 */
function parseSeekHead(view: DataView, element: EbmlElement): SeekEntry[] {
  const entries: SeekEntry[] = [];
  let offset = element.dataStart;
  const end = element.dataStart + element.dataSize;

  while (offset + 2 <= end && offset < view.byteLength) {
    const header = readElementHeader(view, offset);
    if (!header) break;

    if (header.id === ID_SEEK) {
      const seekEnd = header.dataStart + Math.min(header.dataSize, end - header.dataStart);
      let seekOff = header.dataStart;
      let seekId = 0;
      let seekPosition = 0;
      while (seekOff + 2 <= seekEnd && seekOff < view.byteLength) {
        const sub = readElementHeader(view, seekOff);
        if (!sub) break;
        if (sub.id === ID_SEEK_ID && sub.dataSize >= 1) {
          let rawId = 0;
          for (let i = 0; i < sub.dataSize; i++) {
            rawId = (rawId << 8) | view.getUint8(sub.dataStart + i);
          }
          seekId = rawId;
        } else if (sub.id === ID_SEEK_POSITION && sub.dataSize >= 1) {
          seekPosition = readUintValue(view, sub.dataStart, sub.dataSize);
        }
        seekOff += sub.headerSize + sub.dataSize;
      }
      if (seekId !== 0) {
        entries.push({ elementId: seekId, position: seekPosition });
      }
    }

    offset += header.headerSize + (isUnknownSize(header.dataSize) ? 0 : header.dataSize);
  }
  return entries;
}

function readUintValue(view: DataView, offset: number, length: number): number {
  let value = 0;
  for (let i = 0; i < length; i++) {
    value = (value << 8) | view.getUint8(offset + i);
  }
  return value;
}

// ─── Info / TimecodeScale ─────────────────────────────────────────────────────

function parseTimecodeScale(view: DataView, element: EbmlElement): number | null {
  let offset = element.dataStart;
  const end = element.dataStart + element.dataSize;
  while (offset + 2 <= end && offset < view.byteLength) {
    const header = readElementHeader(view, offset);
    if (!header) break;
    if (header.id === ID_TIMECODE_SCALE && header.dataSize >= 1 && header.dataSize <= 8) {
      return readUintValue(view, header.dataStart, header.dataSize);
    }
    offset += header.headerSize + (isUnknownSize(header.dataSize) ? 0 : header.dataSize);
  }
  return null;
}

// ─── Cues parser ────────────────────────────────────────────────────────────────

/**
 * Parse all CueTime values from a Cues element. Returns raw timecode values
 * (caller must multiply by TimecodeScale to get nanoseconds).
 */
function parseCueTimes(view: DataView, element: EbmlElement): number[] {
  const times: number[] = [];
  let offset = element.dataStart;
  const end = element.dataStart + element.dataSize;

  while (offset + 2 <= end && offset < view.byteLength) {
    const header = readElementHeader(view, offset);
    if (!header) break;

    if (header.id === ID_CUE_POINT) {
      const cueEnd = header.dataStart + Math.min(header.dataSize, end - header.dataStart);
      let cueOff = header.dataStart;
      while (cueOff + 2 <= cueEnd && cueOff < view.byteLength) {
        const sub = readElementHeader(view, cueOff);
        if (!sub) break;
        if (sub.id === ID_CUE_TIME && sub.dataSize >= 1 && sub.dataSize <= 8) {
          const timecode = readUintValue(view, sub.dataStart, sub.dataSize);
          times.push(timecode);
        }
        cueOff += sub.headerSize + (isUnknownSize(sub.dataSize) ? 0 : sub.dataSize);
      }
    }

    if (isUnknownSize(header.dataSize)) break;
    offset += header.headerSize + header.dataSize;
  }
  return times;
}

// ─── Main extraction entry point ───────────────────────────────────────────────

/**
 * Default TimecodeScale in Matroska: 1 000 000 ns per timecode unit → 1 ms
 * resolution.
 */
const DEFAULT_TIMECODE_SCALE = 1_000_000;
const NS_PER_SECOND = 1_000_000_000;

const HEAD_FETCH_BYTES = 65_536; // 64 KB
const TAIL_FETCH_BYTES = 8_388_608; // 8 MB

/**
 * Extract keyframe timestamps (in seconds) from a Matroska (mkv/webm) file
 * by parsing its EBML SeekHead → Cues structure via byte-range reads.
 *
 * Strategy:
 * 1. Fetch the first 64 KB. Detect the EBML header + Segment + SeekHead.
 * 2. Parse SeekHead to locate the Cues element and Info element positions
 *    (relative to Segment data start). Read TimecodeScale from Info if present.
 * 3. Fetch and parse the Cues element.
 * 4. Convert raw timecodes → seconds using TimecodeScale.
 *
 * Falls back to scanning the tail for a Cues element ID when no SeekHead
 * is found (some files omit SeekHead). Returns null on any error or when
 * the file doesn't look like valid Matroska.
 */
export async function extractKeyframeTimesFromMkv(
  reader: ByteRangeReader,
  signal?: AbortSignal,
): Promise<number[] | null> {
  if (signal?.aborted) return null;
  if (reader.sizeBytes < 16) return null;

  // 1) Fetch the head.
  const headSize = Math.min(HEAD_FETCH_BYTES, reader.sizeBytes);
  const headBytes = await reader.read(0, headSize, signal);
  if (headBytes.byteLength < 4) return null;
  const headBuf = headBytes.buffer.slice(
    headBytes.byteOffset,
    headBytes.byteOffset + headBytes.byteLength,
  ) as ArrayBuffer;
  const headView = new DataView(headBuf);

  // Detect EBML header.
  const ebmlHeader = readElementHeader(headView, 0);
  if (!ebmlHeader || ebmlHeader.id !== ID_EBML) return null;

  // Find Segment element.
  let segElement: EbmlElement | null = null;
  let segmentDataStart = 0;
  let offset = ebmlHeader.headerSize + ebmlHeader.dataSize;

  while (offset + 2 <= headView.byteLength) {
    const header = readElementHeader(headView, offset);
    if (!header) break;
    if (header.id === ID_SEGMENT) {
      segElement = {
        id: ID_SEGMENT,
        dataStart: header.dataStart,
        dataSize: isUnknownSize(header.dataSize) ? reader.sizeBytes - header.dataStart : header.dataSize,
        headerSize: header.headerSize,
      };
      segmentDataStart = header.dataStart;
      break;
    }
    if (isUnknownSize(header.dataSize)) break;
    offset += header.headerSize + header.dataSize;
  }
  if (!segElement) return null;

  // 2) Walk top-level Segment children that fall within the head to find SeekHead and Info.
  let timecodeScale: number | null = null;
  let cuesPosition: number | null = null;

  let childOffset = segElement.dataStart;
  const childEnd = Math.min(segElement.dataStart + segElement.dataSize, headView.byteLength);

  while (childOffset + 2 <= childEnd) {
    const header = readElementHeader(headView, childOffset);
    if (!header) break;

    if (header.id === ID_SEEK_HEAD && header.dataSize !== undefined) {
      const entries = parseSeekHead(headView, {
        ...header,
        dataSize: Math.min(header.dataSize, childEnd - header.dataStart),
      });
      for (const entry of entries) {
        if (entry.elementId === ID_CUES) {
          cuesPosition = entry.position;
        }
      }
    } else if (header.id === ID_INFO) {
      const infoElement: EbmlElement = {
        id: header.id,
        dataStart: header.dataStart,
        dataSize: Math.min(header.dataSize, childEnd - header.dataStart),
        headerSize: header.headerSize,
      };
      timecodeScale = parseTimecodeScale(headView, infoElement);
    }

    if (isUnknownSize(header.dataSize)) break;
    childOffset += header.headerSize + header.dataSize;
  }

  const effectiveScale = timecodeScale ?? DEFAULT_TIMECODE_SCALE;

  // 3) Fetch and parse Cues.
  if (cuesPosition !== null) {
    const cuesResult = await fetchAndParseCuesAt(reader, segmentDataStart + cuesPosition, signal);
    if (cuesResult) {
      return cuesResult.map((tc) => (tc * effectiveScale) / NS_PER_SECOND).filter((s) => Number.isFinite(s) && s >= 0);
    }
  }

  // 4) Fallback: scan tail for Cues element ID.
  const tailResult = await scanTailForCues(reader, segmentDataStart, signal);
  if (tailResult) {
    return tailResult.map((tc) => (tc * effectiveScale) / NS_PER_SECOND).filter((s) => Number.isFinite(s) && s >= 0);
  }

  return null;
}

/**
 * Fetch the Cues element from an absolute file position. The element's full
 * size might not be known ahead of time, so we fetch a generous chunk and
 * parse as much as we can.
 */
async function fetchAndParseCuesAt(
  reader: ByteRangeReader,
  absolutePos: number,
  signal?: AbortSignal,
): Promise<number[] | null> {
  if (absolutePos < 0 || absolutePos >= reader.sizeBytes) return null;

  // Fetch the element header plus a generous chunk for the body.
  // Typical Cues are a few KB to a few hundred KB.
  const fetchSize = Math.min(2_097_152, reader.sizeBytes - absolutePos); // 2 MB max
  const bytes = await reader.read(absolutePos, fetchSize, signal);
  if (bytes.byteLength < 4) return null;
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const view = new DataView(buf);

  const header = readElementHeader(view, 0);
  if (!header || header.id !== ID_CUES) return null;

  const dataSize = Math.min(header.dataSize, buf.byteLength - header.dataStart);
  return parseCueTimes(view, { id: ID_CUES, dataStart: header.dataStart, dataSize, headerSize: header.headerSize });
}

/**
 * Scan the tail of the file for a Cues element when no SeekHead was found.
 * Looks for the 4-byte Cues element ID (0x1C53BB6B) at element-aligned
 * boundaries.
 */
async function scanTailForCues(
  reader: ByteRangeReader,
  segmentDataStart: number,
  signal?: AbortSignal,
): Promise<number[] | null> {
  const start = Math.max(segmentDataStart, reader.sizeBytes - TAIL_FETCH_BYTES);
  const length = reader.sizeBytes - start;
  if (length < 8) return null;

  const bytes = await reader.read(start, length, signal);
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  // Scan for the Cues element ID: 0x1C 0x53 0xBB 0x6B
  for (let i = 0; i < u8.length - 4; i++) {
    if (u8[i] === 0x1c && u8[i + 1] === 0x53 && u8[i + 2] === 0xbb && u8[i + 3] === 0x6b) {
      const header = readElementHeader(view, i);
      if (header && header.id === ID_CUES) {
        const dataSize = Math.min(header.dataSize, u8.byteLength - header.dataStart);
        const times = parseCueTimes(view, {
          id: ID_CUES,
          dataStart: header.dataStart,
          dataSize,
          headerSize: header.headerSize,
        });
        if (times.length > 0) return times;
      }
    }
  }
  return null;
}
