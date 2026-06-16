import { describe, expect, test } from "bun:test";
import type { FileEntryWithStats } from "ssh2";
import {
  DEFAULT_REMOTE_OPERATION_TIMEOUT_MS,
  DEFAULT_REMOTE_WALK_CONCURRENCY,
  normalizeRemoteOperationTimeoutMs,
  normalizeRemoteWalkConcurrency,
  walkRemoteFiles,
} from "./remote";
import { parseSftpConfig, parseWebdavConfig, webdavDisplayPath } from ".";

function remoteEntry(filename: string, kind: "directory" | "file"): FileEntryWithStats {
  return {
    filename,
    attrs: {
      isDirectory: () => kind === "directory",
      isFile: () => kind === "file",
      size: 1,
      mtime: 1,
    },
  } as unknown as FileEntryWithStats;
}

describe("remote tuning normalization", () => {
  test("validates walk concurrency and operation timeout", () => {
    expect(normalizeRemoteWalkConcurrency(8)).toBe(8);
    expect(normalizeRemoteOperationTimeoutMs(45_000)).toBe(45_000);
    expect(() => normalizeRemoteWalkConcurrency(0)).toThrow("Remote walk concurrency");
    expect(() => normalizeRemoteOperationTimeoutMs(1_000)).toThrow("Remote operation timeout");
  });
});

describe("parseWebdavConfig", () => {
  test("uses database defaults when stored tuning fields are missing", () => {
    const config = parseWebdavConfig(
      JSON.stringify({
        host: "nas.example.com",
        port: 443,
        secure: true,
        username: "mediauser",
        root: "/media",
        passwordEncrypted: "encrypted",
      }),
    );

    expect(config.walkConcurrency).toBe(DEFAULT_REMOTE_WALK_CONCURRENCY);
    expect(config.operationTimeoutMs).toBe(DEFAULT_REMOTE_OPERATION_TIMEOUT_MS);
    expect(config.secure).toBe(true);
  });

  test("builds display paths with and without explicit ports", () => {
    expect(
      webdavDisplayPath({
        host: "nas.example.com",
        port: 443,
        secure: true,
        username: "mediauser",
        root: "/movies",
      }),
    ).toBe("webdavs://mediauser@nas.example.com/movies");
    expect(
      webdavDisplayPath({
        host: "nas.example.com",
        port: 5006,
        secure: true,
        username: "mediauser",
        root: "movies",
      }),
    ).toBe("webdavs://mediauser@nas.example.com:5006/movies");
  });
});

describe("walkRemoteFiles", () => {
  test("walks remote directories with bounded concurrency", async () => {
    let activeReads = 0;
    let maxActiveReads = 0;
    const readOrder: string[] = [];
    const entriesByDirectory = new Map<string, FileEntryWithStats[]>([
      ["/", [remoteEntry("a", "directory"), remoteEntry("b", "directory"), remoteEntry("root.mp4", "file")]],
      ["/a", [remoteEntry("a.mp4", "file")]],
      ["/b", [remoteEntry("b.mp4", "file")]],
    ]);

    const readDirectory = async (directory: string) => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      readOrder.push(directory);
      await new Promise((resolve) => setTimeout(resolve, directory === "/" ? 0 : 20));
      activeReads -= 1;
      return entriesByDirectory.get(directory) ?? [];
    };

    const walkedEntries = [];
    for await (const entry of walkRemoteFiles("/", readDirectory, 2)) {
      walkedEntries.push(entry);
    }

    expect(maxActiveReads).toBe(2);
    expect(readOrder).toEqual(["/", "/a", "/b"]);
    expect(
      walkedEntries
        .filter((entry) => entry.kind === "file")
        .map((entry) => entry.path)
        .sort(),
    ).toEqual(["/a/a.mp4", "/b/b.mp4", "/root.mp4"]);
  });
});

describe("parseSftpConfig", () => {
  test("uses database defaults when stored tuning fields are missing", () => {
    const config = parseSftpConfig(
      JSON.stringify({
        host: "sftp.example.com",
        port: 22,
        username: "mediauser",
        root: "/media",
        passwordEncrypted: "encrypted",
      }),
    );

    expect(config.walkConcurrency).toBe(DEFAULT_REMOTE_WALK_CONCURRENCY);
    expect(config.operationTimeoutMs).toBe(DEFAULT_REMOTE_OPERATION_TIMEOUT_MS);
  });

  test("rejects missing config json", () => {
    expect(() => parseSftpConfig(null)).toThrow("SFTP library is missing connection config.");
  });

  test("rejects incomplete config json", () => {
    expect(() => parseSftpConfig(JSON.stringify({ host: "sftp.example.com" }))).toThrow(
      "SFTP library config is incomplete.",
    );
  });
});
