import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Readable } from "node:stream";
import { encryptSecret } from "../secrets";
import type { WebdavLibraryConfig } from "./webdav";
import { expectRejectsToThrow } from "$lib/test/async-expect";

type MockWebdavStat = {
  type: "file" | "directory";
  basename: string;
  size: number;
  lastmod: string;
};

const mockStat = mock(
  async (_path: string): Promise<MockWebdavStat> => ({
    type: "directory",
    basename: "movies",
    size: 0,
    lastmod: new Date(0).toUTCString(),
  }),
);
const mockGetDirectoryContents = mock(
  async () =>
    [] as Array<{
      type: "file" | "directory";
      basename: string;
      size: number;
      lastmod: string;
    }>,
);
const mockCreateReadStream = mock(() => Readable.from(Buffer.from("abc")));

mock.module("webdav", () => ({
  createClient: () => ({
    stat: mockStat,
    getDirectoryContents: mockGetDirectoryContents,
    createReadStream: mockCreateReadStream,
  }),
}));

let createWebdavStorage: typeof import("./webdav").createWebdavStorage;
let parseWebdavConfig: typeof import("./webdav").parseWebdavConfig;
let testWebdavConnection: typeof import("./webdav").testWebdavConnection;

function sampleConfig(overrides: Partial<WebdavLibraryConfig> = {}): WebdavLibraryConfig {
  return {
    host: "nas.example.com",
    port: 443,
    secure: true,
    username: "mediauser",
    root: "/media/movies",
    passwordEncrypted: encryptSecret("secret"),
    walkConcurrency: 4,
    operationTimeoutMs: 30_000,
    ...overrides,
  };
}

beforeAll(async () => {
  const webdav = await import("./webdav");
  createWebdavStorage = webdav.createWebdavStorage;
  parseWebdavConfig = webdav.parseWebdavConfig;
  testWebdavConnection = webdav.testWebdavConnection;
});

beforeEach(() => {
  mockStat.mockReset();
  mockGetDirectoryContents.mockReset();
  mockCreateReadStream.mockReset();
  mockStat.mockImplementation(async () => ({
    type: "directory",
    basename: "movies",
    size: 0,
    lastmod: new Date(0).toUTCString(),
  }));
  mockGetDirectoryContents.mockImplementation(async () => []);
  mockCreateReadStream.mockImplementation(() => Readable.from(Buffer.from("abc")));
});

describe("parseWebdavConfig errors", () => {
  test("rejects missing config json", () => {
    expect(() => parseWebdavConfig(null)).toThrow("WebDAV library is missing connection config.");
  });

  test("rejects incomplete config json", () => {
    expect(() => parseWebdavConfig(JSON.stringify({ host: "nas.example.com" }))).toThrow(
      "WebDAV library config is incomplete.",
    );
  });

  test("defaults insecure port to 80 when secure is false", () => {
    const config = parseWebdavConfig(
      JSON.stringify({
        host: "nas.example.com",
        secure: false,
        username: "mediauser",
        root: "/media",
        passwordEncrypted: encryptSecret("secret"),
      }),
    );
    expect(config.port).toBe(80);
    expect(config.secure).toBe(false);
  });
});

describe("testWebdavConnection", () => {
  test("accepts an existing remote directory root", async () => {
    await testWebdavConnection(sampleConfig());
    expect(mockStat).toHaveBeenCalledWith("/media/movies");
  });

  test("rejects a root that is not a directory", async () => {
    mockStat.mockImplementation(async () => ({
      type: "file",
      basename: "movies.mkv",
      size: 10,
      lastmod: new Date(0).toUTCString(),
    }));

    await expectRejectsToThrow(testWebdavConnection(sampleConfig()), "WebDAV root must be a directory.");
  });

  test("suggests dropping a leading slash when only the alternate root exists", async () => {
    mockStat.mockImplementation(async (filePath: string) => {
      if (filePath === "/media/movies") throw new Error("404");
      if (filePath === "media/movies") {
        return {
          type: "directory",
          basename: "movies",
          size: 0,
          lastmod: new Date(0).toUTCString(),
        };
      }
      throw new Error("missing");
    });

    await expectRejectsToThrow(
      testWebdavConnection(sampleConfig()),
      'WebDAV root was not found. Try "media/movies" without the leading slash.',
    );
  });
});

describe("createWebdavStorage", () => {
  test("stats files and lists directory entries from WebDAV", async () => {
    mockStat.mockImplementation(async (filePath: string) => {
      if (filePath !== "/media/movies/Remote.Movie.2026.mp4") throw new Error("missing");
      return {
        type: "file",
        basename: "Remote.Movie.2026.mp4",
        size: 1234,
        lastmod: new Date(1_800_000_000_000).toUTCString(),
      };
    });
    mockGetDirectoryContents.mockImplementation(async () => [
      {
        type: "file",
        basename: "Remote.Movie.2026.mp4",
        size: 1234,
        lastmod: new Date(1_800_000_000_000).toUTCString(),
      },
    ]);

    const storage = await createWebdavStorage(JSON.stringify(sampleConfig()));
    const file = await storage.statFile("/media/movies/Remote.Movie.2026.mp4");
    expect(file).toMatchObject({
      path: "/media/movies/Remote.Movie.2026.mp4",
      basename: "Remote.Movie.2026.mp4",
      extension: ".mp4",
      size: 1234,
    });

    const files = await storage.listFiles("/media/movies");
    expect(files).toEqual([
      expect.objectContaining({
        basename: "Remote.Movie.2026.mp4",
        size: 1234,
      }),
    ]);
    await storage.close();
  });

  test("passes byte ranges to the WebDAV read stream", async () => {
    const storage = await createWebdavStorage(JSON.stringify(sampleConfig()));
    const stream = await storage.createReadStream(
      "/media/movies/Remote.Movie.2026.mp4",
      { start: 4, end: 11 },
      { keepOpen: true },
    );
    expect(mockCreateReadStream).toHaveBeenCalledWith("/media/movies/Remote.Movie.2026.mp4", {
      range: { start: 4, end: 11 },
    });
    stream.destroy();
    await storage.close();
  });
});
