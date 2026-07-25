import { describe, expect, test } from "bun:test";
import {
  createSeekableByteRangeReader,
  extractKeyframeTimesFromMp4,
  probeMp4Keyframes,
  type ByteRangeReader,
} from "./mp4-stss";
import type { SeekableTranscodeInputSource } from "./backend";

function makeBufferReader(bytes: Uint8Array): ByteRangeReader {
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

// Build a minimal mp4 with: ftyp, moov{trak{mdia{mdhd, minf{stbl{stts, stss}}}}}
// timescale = 1000 (milliseconds). Sample deltas of 1000 → 1s per sample.
function buildMinimalMp4(opts: { moovAtEnd?: boolean; keyframes?: number[] } = {}): Uint8Array {
  const { moovAtEnd = false, keyframes = [] } = opts;

  function box(type: string, body: number[]): number[] {
    const size = 8 + body.length;
    return [...u32(size), ...ascii(type), ...body];
  }

  function u32(v: number): number[] {
    return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  }

  function ascii(s: string): number[] {
    return [...s].map((c) => c.charCodeAt(0));
  }

  // mdhd (v0): version(1) + flags(3) + creation(4) + modification(4) + timescale(4) + duration(4)
  const sampleCount = keyframes.length > 0 ? keyframes[keyframes.length - 1] : 0;
  const timescale = 1000;
  const mdhd = box("mdhd", [
    0,
    0,
    0,
    0, // version + flags
    0,
    0,
    0,
    0, // creation
    0,
    0,
    0,
    0, // modification
    ...u32(timescale),
    ...u32(sampleCount * 1000), // duration
  ]);

  // stts: version+flags(4) + entry_count(4) + [sample_count(4), sample_delta(4)]
  // one entry: sampleCount samples, delta=1000ms
  const stts = box("stts", [
    0,
    0,
    0,
    0, // version + flags
    ...u32(1), // entry_count
    ...u32(sampleCount),
    ...u32(1000), // delta = 1s in timescale units
  ]);

  // stss: version+flags(4) + entry_count(4) + sample_numbers(4 each)
  const stss = box("stss", [0, 0, 0, 0, ...u32(keyframes.length), ...keyframes.flatMap((k) => u32(k))]);

  const stbl = box("stbl", [...stts, ...stss]);
  const minf = box("minf", [...stbl]);
  const mdia = box("mdia", [...mdhd, ...minf]);
  const trak = box("trak", [...mdia]);
  const moov = box("moov", [...trak]);

  const ftyp = box("ftyp", [...ascii("isom"), ...u32(0x200), ...ascii("isom")]);

  const chunks = moovAtEnd ? [ftyp, moov] : [ftyp, moov];
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

describe("extractKeyframeTimesFromMp4", () => {
  test("returns null for empty input", async () => {
    const reader = makeBufferReader(new Uint8Array(0));
    expect(await extractKeyframeTimesFromMp4(reader)).toBeNull();
  });

  test("returns null for input smaller than 16 bytes", async () => {
    const reader = makeBufferReader(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(await extractKeyframeTimesFromMp4(reader)).toBeNull();
  });

  test("returns null when no ftyp box is present (mkv/webm)", async () => {
    const bytes = new Uint8Array([
      ...[0, 0, 0, 0x20], // size
      ...[0x1a, 0x45, 0xdf, 0xa3], // EBML magic (matroska)
      ...new Array(24).fill(0),
    ]);
    const reader = makeBufferReader(bytes);
    expect(await extractKeyframeTimesFromMp4(reader)).toBeNull();
  });

  test("extracts keyframe timestamps from a minimal mp4", async () => {
    // Keyframes at sample 1, 3, 5 => timestamps 0s, 2s, 4s (1s per sample)
    const bytes = buildMinimalMp4({ keyframes: [1, 3, 5] });
    const reader = makeBufferReader(bytes);
    const result = await extractKeyframeTimesFromMp4(reader);
    expect(result).toEqual([0, 2, 4]);
  });

  test("extracts keyframes from moov-at-end layout", async () => {
    const bytes = buildMinimalMp4({ moovAtEnd: true, keyframes: [1, 2, 3] });
    const reader = makeBufferReader(bytes);
    const result = await extractKeyframeTimesFromMp4(reader);
    expect(result).toEqual([0, 1, 2]);
  });

  test("returns null if there is no stss table", async () => {
    // Build broken mp4 directly — mdhd + minf+stbl+stts but no stss.
    function u32(v: number): number[] {
      return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
    }
    function ascii(s: string): number[] {
      return [...s].map((c) => c.charCodeAt(0));
    }
    function box(type: string, body: number[]): number[] {
      const size = 8 + body.length;
      return [...u32(size), ...ascii(type), ...body];
    }
    const stts = box("stts", [0, 0, 0, 0, ...u32(1), ...u32(3), ...u32(1000)]);
    const stbl = box("stbl", [...stts]);
    const minf = box("minf", [...stbl]);
    const mdhd = box("mdhd", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(1000), ...u32(3000)]);
    const mdia = box("mdia", [...mdhd, ...minf]);
    const trak = box("trak", [...mdia]);
    const moov = box("moov", [...trak]);
    const ftyp = box("ftyp", [...ascii("isom"), ...u32(0x200), ...ascii("isom")]);
    const array = new Uint8Array(ftyp.length + moov.length);
    array.set(ftyp, 0);
    array.set(moov, ftyp.length);
    const reader = makeBufferReader(array);
    expect(await extractKeyframeTimesFromMp4(reader)).toBeNull();
  });
});

describe("probeMp4Keyframes", () => {
  test("returns null for empty path and missing inputSource", async () => {
    const result = await probeMp4Keyframes({
      mediaFileId: "test",
      path: "",
      signal: undefined,
    });
    expect(result).toBeNull();
  });

  test("returns null when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await probeMp4Keyframes({
      mediaFileId: "test",
      path: "/tmp/nonexistent",
      signal: controller.signal,
    });
    expect(result).toBeNull();
  });

  test("reads via SeekableTranscodeInputSource adapter", async () => {
    const bytes = buildMinimalMp4({ keyframes: [1, 2, 4] });
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const source: SeekableTranscodeInputSource = {
      kind: "seekable",
      label: "test",
      sizeBytes: bytes.byteLength,
      async read(start, length) {
        const end = Math.min(start + length, bytes.byteLength);
        return Buffer.from(buffer, start, end - start);
      },
      close: async () => undefined,
    };
    const result = await probeMp4Keyframes({
      mediaFileId: "test",
      path: "",
      inputSource: source,
    });
    expect(result).toEqual([0, 1, 3]);
  });

  test("createSeekableByteRangeReader proxies sizeBytes", () => {
    const source: SeekableTranscodeInputSource = {
      kind: "seekable",
      label: "x",
      sizeBytes: 12345,
      read: async () => Buffer.alloc(0),
      close: async () => undefined,
    };
    const reader = createSeekableByteRangeReader(source);
    expect(reader.sizeBytes).toBe(12345);
  });
});
