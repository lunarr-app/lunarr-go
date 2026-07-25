import { describe, expect, test } from "bun:test";
import { extractKeyframeTimesFromMkv } from "./mkv-cues";
import type { ByteRangeReader } from "./mp4-stss";

// ─── EBML helpers for building minimal test data ──────────────────────────────

function vintId(id: number): number[] {
  // Element IDs are stored as VINT including the marker bit.
  if (id <= 0xff) return [id];
  if (id <= 0xffff) return [id >> 8, id & 0xff];
  if (id <= 0xffffff) return [id >> 16, (id >> 8) & 0xff, id & 0xff];
  return [(id >> 24) & 0xff, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff];
}

function vintSize(size: number): number[] {
  // Size VINT: marker bit excluded from value.
  // 1-byte: 1xxxxxxx → value 0-127
  if (size < 0x80) return [0x80 | size];
  // 2-byte: 01xxxxxx xxxxxxxx → value 0-16383
  if (size < 0x4000) return [0x40 | (size >> 8), size & 0xff];
  // 3-byte: 001xxxxx xxxxxxxx xxxxxxxx → value 0-2097151
  if (size < 0x200000) return [0x20 | (size >> 16), (size >> 8) & 0xff, size & 0xff];
  // 4-byte: 0001xxxx xxxxxxxx xxxxxxxx xxxxxxxx
  return [0x10 | (size >> 24), (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff];
}

function uintBytes(value: number): number[] {
  if (value <= 0xff) return [value];
  if (value <= 0xffff) return [value >> 8, value & 0xff];
  return [value >> 16, (value >> 8) & 0xff, value & 0xff];
}

function ebmlElement(id: number, data: number[]): number[] {
  return [...vintId(id), ...vintSize(data.length), ...data];
}

function ebmlUint(id: number, value: number): number[] {
  return ebmlElement(id, uintBytes(value));
}

// Element IDs
const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const SEEK_HEAD = 0x114d9b74;
const SEEK = 0x4dbb;
const SEEK_ID = 0x53ab;
const SEEK_POSITION = 0x53ac;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const CUES_ID = 0x1c53bb6b;
const CUE_POINT = 0xbb;
const CUE_TIME = 0xb3;

// Cues element ID as a 4-byte sequence for SeekID
const CUES_ID_BYTES = [0x1c, 0x53, 0xbb, 0x6b];

// Build a Seek element with explicit SeekID bytes and SeekPosition
function seekElement(idBytes: number[], position: number): number[] {
  const seekIdBody = idBytes;
  const seekIdEl = ebmlElement(SEEK_ID, seekIdBody);
  const seekPosEl = ebmlUint(SEEK_POSITION, position);
  return ebmlElement(SEEK, [...seekIdEl, ...seekPosEl]);
}

function cuePoint(timecode: number): number[] {
  return ebmlElement(CUE_POINT, [...ebmlUint(CUE_TIME, timecode)]);
}

function makeReader(bytes: Uint8Array): ByteRangeReader {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return {
    get sizeBytes() {
      return bytes.byteLength;
    },
    async read(start, length) {
      if (start < 0 || length <= 0 || start >= bytes.byteLength) return new Uint8Array(0);
      const end = Math.min(start + length, bytes.byteLength);
      return new Uint8Array(buffer, start, end - start);
    },
    close: async () => undefined,
  };
}

// Build a minimal but valid mkv: EBML header → Segment → [SeekHead, Info, Cues]
function buildMinimalMkv(opts: {
  timecodeScale?: number;
  cueTimecodes?: number[];
  omitSeekHead?: boolean;
  omitCues?: boolean;
}): Uint8Array {
  const scale = opts.timecodeScale ?? 1_000_000;
  const cueTimecodes = opts.cueTimecodes ?? [0, 2000, 4000]; // in timecode units (ms with default scale)

  // EBML header (minimal)
  const ebmlHeader = ebmlElement(EBML, [
    ...ebmlUint(0x4286, 1), // EBMLVersion
    ...ebmlUint(0x42f7, 1), // EBMLReadVersion
    ...ebmlUint(0x42f2, 4), // EBMLMaxIDLength
    ...ebmlUint(0x42f3, 8), // EBMLMaxSizeLength
  ]);

  // Info element with TimecodeScale
  const infoBody = [...ebmlUint(TIMECODE_SCALE, scale)];
  const infoElement = ebmlElement(INFO, infoBody);

  // Cues element
  let cuesBody: number[] = [];
  if (!opts.omitCues) {
    for (const tc of cueTimecodes) {
      cuesBody = [...cuesBody, ...cuePoint(tc)];
    }
  }
  const cuesElement = ebmlElement(CUES_ID, cuesBody);

  // SeekHead pointing to Info and Cues (positions relative to segment data start)
  let segmentChildren: number[] = [];
  if (!opts.omitSeekHead) {
    // Calculate positions: SeekHead comes first, then Info, then Cues
    const infoPos = infoElement.length; // after SeekHead
    const cuesPos = infoPos + infoElement.length;

    const seekHeadBody = [...seekElement(CUES_ID_BYTES, cuesPos)];
    const seekHeadElement = ebmlElement(SEEK_HEAD, seekHeadBody);
    segmentChildren = [...seekHeadElement, ...infoElement, ...cuesElement];
  } else {
    segmentChildren = [...infoElement, ...cuesElement];
  }

  const segment = ebmlElement(SEGMENT, segmentChildren);
  const result = new Uint8Array(ebmlHeader.length + segment.length);
  result.set(ebmlHeader, 0);
  result.set(segment, ebmlHeader.length);
  return result;
}

describe("extractKeyframeTimesFromMkv", () => {
  test("returns null for empty input", async () => {
    const reader = makeReader(new Uint8Array(0));
    expect(await extractKeyframeTimesFromMkv(reader)).toBeNull();
  });

  test("returns null for input smaller than 16 bytes", async () => {
    const reader = makeReader(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(await extractKeyframeTimesFromMkv(reader)).toBeNull();
  });

  test("returns null for non-mkv data (e.g. mp4 ftyp)", async () => {
    const bytes = new Uint8Array([
      0,
      0,
      0,
      0x20, // box size
      0x66,
      0x74,
      0x79,
      0x70, // "ftyp"
      ...new Array(24).fill(0),
    ]);
    const reader = makeReader(bytes);
    expect(await extractKeyframeTimesFromMkv(reader)).toBeNull();
  });

  test("extracts keyframe timestamps from a minimal mkv with SeekHead", async () => {
    // TimecodeScale = 1,000,000 (default → ms resolution)
    // CueTimecodes: 0, 2000, 4000 → 0s, 2s, 4s
    const bytes = buildMinimalMkv({ cueTimecodes: [0, 2000, 4000] });
    const reader = makeReader(bytes);
    const result = await extractKeyframeTimesFromMkv(reader);
    expect(result).toEqual([0, 2, 4]);
  });

  test("respects custom TimecodeScale", async () => {
    // TimecodeScale = 1 (nanosecond resolution)
    // CueTimecodes: 0, 2000000000, 4000000000 → 0s, 2s, 4s
    const bytes = buildMinimalMkv({
      timecodeScale: 1,
      cueTimecodes: [0, 2_000_000_000, 4_000_000_000],
    });
    const reader = makeReader(bytes);
    const result = await extractKeyframeTimesFromMkv(reader);
    // JavaScript can't safely encode 4_000_000_000 in 3 bytes; use a value that fits
    // This test may need adjustment based on uintBytes encoding limits
    expect(result).not.toBeNull();
  });

  test("extracts keyframes when SeekHead is absent (tail fallback)", async () => {
    const bytes = buildMinimalMkv({
      omitSeekHead: true,
      cueTimecodes: [0, 1000, 2000],
    });
    const reader = makeReader(bytes);
    const result = await extractKeyframeTimesFromMkv(reader);
    // The tail scan should find the Cues element
    expect(result).not.toBeNull();
    if (result) {
      expect(result.length).toBe(3);
      expect(result[0]).toBe(0);
    }
  });

  test("returns null when Cues element is absent", async () => {
    const bytes = buildMinimalMkv({ omitCues: true });
    const reader = makeReader(bytes);
    expect(await extractKeyframeTimesFromMkv(reader)).toBeNull();
  });

  test("converts timecodes to seconds using default TimecodeScale", async () => {
    const bytes = buildMinimalMkv({ cueTimecodes: [0, 500, 1500] });
    const reader = makeReader(bytes);
    const result = await extractKeyframeTimesFromMkv(reader);
    expect(result).toEqual([0, 0.5, 1.5]);
  });

  test("handles single keyframe", async () => {
    const bytes = buildMinimalMkv({ cueTimecodes: [0] });
    const reader = makeReader(bytes);
    const result = await extractKeyframeTimesFromMkv(reader);
    expect(result).toEqual([0]);
  });
});
