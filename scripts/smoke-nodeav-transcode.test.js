import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertRequestedSegmentReadyBeforeWindowComplete,
  assertSegmentsAbsent,
  firstProbeableInputFromDirectory,
  mediaFilesInDirectory,
  streamCounts,
} from "./smoke-nodeav-transcode.mjs";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function expectRejectsToThrow(promise, expected) {
  try {
    await promise;
  } catch (error) {
    expect(() => {
      throw error;
    }).toThrow(expected);
    return;
  }

  throw new Error("Expected promise to reject.");
}

async function makeTempMediaTree() {
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-smoke-discovery-"));
  await mkdir(path.join(tempDir, "nested"), { recursive: true });
  await writeFile(path.join(tempDir, "a-video.mp4"), "video");
  await writeFile(path.join(tempDir, "z-video.mp4"), "video");
  await writeFile(
    path.join(tempDir, "nested", "audio-video.mkv"),
    "audio-video",
  );
  await writeFile(path.join(tempDir, "ignore.txt"), "ignored");
  return tempDir;
}

function probeFromCounts(countsByBasename) {
  return async ({ path: inputPath }) => {
    const basename = path.basename(inputPath);
    const counts = countsByBasename[basename];
    if (!counts) throw new Error("unprobeable");
    return {
      container: "test",
      durationSeconds: 10,
      bitRate: null,
      streams: [
        ...Array.from({ length: counts.video ?? 0 }, () => ({ type: "video" })),
        ...Array.from({ length: counts.audio ?? 0 }, () => ({ type: "audio" })),
      ],
    };
  };
}

describe("smoke transcode discovery helpers", () => {
  test("lists supported media files in deterministic order", async () => {
    const directory = await makeTempMediaTree();

    const files = await mediaFilesInDirectory(directory);

    expect(files.map((file) => path.relative(directory, file))).toEqual([
      "a-video.mp4",
      path.join("nested", "audio-video.mkv"),
      "z-video.mp4",
    ]);
  });

  test("selects the first probeable video unless audio is required", async () => {
    const directory = await makeTempMediaTree();
    const probe = probeFromCounts({
      "a-video.mp4": { video: 1, audio: 0 },
      "audio-video.mkv": { video: 1, audio: 1 },
      "z-video.mp4": { video: 1, audio: 0 },
    });

    const discovered = await firstProbeableInputFromDirectory(directory, {
      requireAudio: false,
      probe,
    });
    const audioDiscovered = await firstProbeableInputFromDirectory(directory, {
      requireAudio: true,
      probe,
    });

    expect(path.basename(discovered.inputPath)).toBe("a-video.mp4");
    expect(path.basename(audioDiscovered.inputPath)).toBe("audio-video.mkv");
    expect(audioDiscovered.checked).toBe(2);
  });

  test("fails clearly when audio is required but no media has audio", async () => {
    const directory = await makeTempMediaTree();
    const probe = probeFromCounts({
      "a-video.mp4": { video: 1, audio: 0 },
      "audio-video.mkv": { video: 1, audio: 0 },
      "z-video.mp4": { video: 1, audio: 0 },
    });

    await expectRejectsToThrow(
      firstProbeableInputFromDirectory(directory, {
        requireAudio: true,
        probe,
      }),
      `No audio-bearing smoke input found in ${directory}. Checked 3 media files.`,
    );
  });

  test("counts streams and rejects impossible request-driven timing", () => {
    expect(
      streamCounts({
        streams: [{ type: "video" }, { type: "audio" }, { type: "audio" }],
      }),
    ).toEqual({ videoStreams: 1, audioStreams: 2 });
    expect(
      assertRequestedSegmentReadyBeforeWindowComplete({
        label: "request-driven",
        requestedReadyMs: 10,
        windowCompleteMs: 20,
      }),
    ).toBe(true);
    expect(() =>
      assertRequestedSegmentReadyBeforeWindowComplete({
        label: "request-driven",
        requestedReadyMs: 20,
        windowCompleteMs: 10,
      }),
    ).toThrow(
      "requested segment became ready after the bounded window completed",
    );
  });

  test("asserts skipped request-driven segments were not generated", async () => {
    const directory = await makeTempMediaTree();

    expect(
      await assertSegmentsAbsent({
        label: "late-seek",
        artifactDirectory: directory,
        segments: ["segment-00005.ts", "segment-00006.ts"],
      }),
    ).toEqual({
      absentSegments: ["segment-00005.ts", "segment-00006.ts"],
      absentSegmentCount: 2,
    });

    await writeFile(path.join(directory, "segment-00005.ts"), "generated");

    await expectRejectsToThrow(
      assertSegmentsAbsent({
        label: "late-seek",
        artifactDirectory: directory,
        segments: ["segment-00005.ts", "segment-00006.ts"],
      }),
      "late-seek unexpectedly generated skipped segment(s): segment-00005.ts",
    );
  });
});
