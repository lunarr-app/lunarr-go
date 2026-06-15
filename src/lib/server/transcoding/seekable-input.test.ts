import { describe, expect, test } from "bun:test";
import { Readable } from "node:stream";
import {
  createSeekableInputSourceFromStorage,
  REMOTE_READ_CANCELLED_MESSAGE,
  sniffContainerFromStorage,
} from "./seekable-input";
import type { LibraryStorage } from "../storage";

function storageFromHead(head: Buffer, sizeBytes = head.length): LibraryStorage {
  return {
    source: "webdav",
    root: "media",
    operationTimeoutMs: 5_000,
    async statFile() {
      return null;
    },
    async listFiles() {
      return null;
    },
    walkFiles() {
      return (async function* () {})();
    },
    async createReadStream(_filePath, range) {
      const start = range?.start ?? 0;
      const end = range?.end ?? head.length - 1;
      return Readable.from([head.subarray(start, end + 1)]);
    },
    async close() {},
  };
}

describe("createSeekableInputSourceFromStorage", () => {
  test("uses sniffed mp4 format for a mislabeled mkv file", async () => {
    const head = Buffer.from("000000206674797069736f6d00000200isomiso2avc1mp41", "hex");
    const inputSource = await createSeekableInputSourceFromStorage({
      file: {
        path: "shows/example.mkv",
        extension: ".mkv",
        container: "mkv",
        sizeBytes: head.length,
      },
      storage: storageFromHead(head),
    });

    expect(inputSource.format).toBe("mp4");
    await inputSource.close();
  });
});

describe("sniffContainerFromStorage", () => {
  test("propagates setup abort instead of falling back", async () => {
    const controller = new AbortController();
    controller.abort();
    const head = Buffer.from("000000206674797069736f6d00000200", "hex");

    let caught: unknown;
    try {
      await sniffContainerFromStorage({
        filePath: "shows/example.mkv",
        storage: storageFromHead(head),
        sizeBytes: head.length,
        setupSignal: controller.signal,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(REMOTE_READ_CANCELLED_MESSAGE);
  });

  test("falls back when sniff read fails for non-cancel reasons", async () => {
    const storage: LibraryStorage = {
      source: "webdav",
      root: "media",
      operationTimeoutMs: 5_000,
      async statFile() {
        return null;
      },
      async listFiles() {
        return null;
      },
      walkFiles() {
        return (async function* () {})();
      },
      async createReadStream() {
        throw new Error("network down");
      },
      async close() {},
    };

    expect(
      await sniffContainerFromStorage({
        filePath: "shows/example.mkv",
        storage,
        sizeBytes: 64,
      }),
    ).toEqual({ container: null, head: null });
  });
});
