import { describe, expect, test } from "bun:test";
import type { FileEntryWithStats } from "ssh2";
import {
  DEFAULT_SFTP_OPERATION_TIMEOUT_MS,
  DEFAULT_SFTP_WALK_CONCURRENCY,
  normalizeSftpOperationTimeoutMs,
  normalizeSftpWalkConcurrency,
  parseSftpConfig,
  walkSftpFiles,
} from ".";

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

describe("walkSftpFiles", () => {
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
    for await (const entry of walkSftpFiles("/", readDirectory, 2)) {
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

    expect(config.walkConcurrency).toBe(DEFAULT_SFTP_WALK_CONCURRENCY);
    expect(config.operationTimeoutMs).toBe(DEFAULT_SFTP_OPERATION_TIMEOUT_MS);
  });

  test("validates SFTP tuning values", () => {
    expect(normalizeSftpWalkConcurrency(8)).toBe(8);
    expect(normalizeSftpOperationTimeoutMs(45_000)).toBe(45_000);
    expect(() => normalizeSftpWalkConcurrency(0)).toThrow("SFTP walk concurrency");
    expect(() => normalizeSftpOperationTimeoutMs(1_000)).toThrow("SFTP operation timeout");
  });
});
