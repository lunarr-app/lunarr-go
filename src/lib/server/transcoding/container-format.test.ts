import { describe, expect, test } from "bun:test";
import {
  detectContainerFromMagic,
  nodeAvInputFormat,
  remoteContainerSniffNeeded,
  resolveNodeAvInputFormat,
} from "./container-format";

describe("detectContainerFromMagic", () => {
  test("detects matroska from EBML header", () => {
    const head = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from("matroska")]);
    expect(detectContainerFromMagic(head)).toBe("matroska");
  });

  test("detects webm from EBML DocType", () => {
    const head = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from("webm")]);
    expect(detectContainerFromMagic(head)).toBe("webm");
  });

  test("detects mp4 from ftyp box", () => {
    const head = Buffer.from("000000206674797069736f6d00000200isomiso2avc1mp41", "hex");
    expect(detectContainerFromMagic(head)).toBe("mp4");
  });

  test("detects avi from RIFF header", () => {
    const head = Buffer.alloc(12);
    head.write("RIFF", 0, "ascii");
    head.write("AVI ", 8, "ascii");
    expect(detectContainerFromMagic(head)).toBe("avi");
  });

  test("detects mpegts from sync bytes", () => {
    const head = Buffer.alloc(189, 0x47);
    expect(detectContainerFromMagic(head)).toBe("mpegts");
  });
});

describe("resolveNodeAvInputFormat", () => {
  test("prefers sniffed container over extension", () => {
    expect(
      resolveNodeAvInputFormat({
        sniffedContainer: "mp4",
        container: "matroska",
        extension: ".mkv",
      }),
    ).toBe("mp4");
  });

  test("uses probed container before extension when sniff is unavailable", () => {
    expect(
      resolveNodeAvInputFormat({
        container: "mp4",
        extension: ".mkv",
      }),
    ).toBe("mp4");
  });

  test("falls back to extension when only extension is known", () => {
    expect(
      resolveNodeAvInputFormat({
        container: null,
        extension: ".mkv",
      }),
    ).toBe("matroska");
  });

  test("maps ffprobe composite container names", () => {
    expect(
      resolveNodeAvInputFormat({
        container: "mov,mp4,m4a,3gp,3g2,mj2",
        extension: ".mkv",
      }),
    ).toBe("mp4");
  });
});

describe("nodeAvInputFormat", () => {
  test("does not let mkv extension override probed mp4 container", () => {
    expect(
      nodeAvInputFormat({
        container: "mp4",
        extension: ".mkv",
      }),
    ).toBe("mp4");
  });
});

describe("remoteContainerSniffNeeded", () => {
  test("skips sniff when probed metadata agrees with extension", () => {
    expect(
      remoteContainerSniffNeeded({
        duration_seconds: 60,
        video_codec: "h264",
        container: "matroska",
        extension: ".mkv",
      }),
    ).toBe(false);
  });

  test("sniffs when extension and probed container disagree", () => {
    expect(
      remoteContainerSniffNeeded({
        duration_seconds: 60,
        video_codec: "h264",
        container: "mp4",
        extension: ".mkv",
      }),
    ).toBe(true);
  });

  test("sniffs when probe metadata is incomplete", () => {
    expect(
      remoteContainerSniffNeeded({
        duration_seconds: null,
        video_codec: null,
        container: "mkv",
        extension: ".mkv",
      }),
    ).toBe(true);
  });
});
