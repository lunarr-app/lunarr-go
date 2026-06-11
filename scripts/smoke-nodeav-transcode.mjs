#!/usr/bin/env bun

import { mkdtemp, open, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { nodeAvBackend } from "../src/lib/server/transcoding/node-av.ts";

const DEFAULT_INPUTS = [
  ".lunarr/fixtures/transcode/mp4_192s_h264_aac_360p_sample.mp4",
  ".lunarr/fixtures/transcode/mp4_60s_sample_file_3.4MB.mp4",
  ".lunarr/fixtures/radarr/.sample-video-cache/Big_Buck_Bunny_360_10s_1MB.mp4",
];
const DEFAULT_INPUT_DIR = ".lunarr/fixtures/radarr";
const TRANSCODE_TIMEOUT_MS = 120_000;
const MEDIA_FILE_PATTERN = /\.(mp4|mkv|mov|webm)$/i;
const LATE_SEEK_MIN_DURATION_SECONDS = 192;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function timeoutAfter(ms, label) {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms.`)),
      ms,
    );
  });
}

async function requireInputFile(inputPath) {
  try {
    const details = await stat(inputPath);
    if (details.isFile()) return;
  } catch {
    // handled below
  }

  throw new Error(
    `Smoke input was not found: ${inputPath}\n` +
      "Pass --input /path/to/video.mp4 or seed playable fixtures with `bun run seed:radarr -- --clean --playback`.",
  );
}

async function firstAvailableDefaultInput() {
  for (const candidate of DEFAULT_INPUTS) {
    const inputPath = path.resolve(candidate);
    try {
      const details = await stat(inputPath);
      if (details.isFile()) {
        return { inputPath, discoveredFromDirectory: null, checked: 0 };
      }
    } catch {
      // Try the next bundled/local smoke fixture.
    }
  }

  throw new Error(
    "No default smoke input was found. Checked:\n" +
      DEFAULT_INPUTS.map((candidate) => `- ${candidate}`).join("\n") +
      "\nPass --input /path/to/video.mp4 or seed playable fixtures with `bun run seed:radarr -- --clean --playback`.",
  );
}

export async function mediaFilesInDirectory(directory) {
  const files = [];
  async function walk(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (MEDIA_FILE_PATTERN.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }

  await walk(directory);
  files.sort((left, right) => left.localeCompare(right));
  return files;
}

export async function firstProbeableInputFromDirectory(directory, input) {
  const files = await mediaFilesInDirectory(directory);
  let checked = 0;
  let firstVideoInput = null;
  const probeMedia =
    input.probe ?? ((probeInput) => nodeAvBackend.probe(probeInput));

  for (const file of files) {
    checked += 1;
    const inputPath = path.resolve(file);
    try {
      const probe = await probeMedia({
        mediaFileId: `smoke-discovery-${checked}`,
        path: inputPath,
      });
      const counts = streamCounts(probe);
      if (counts.videoStreams <= 0) continue;
      firstVideoInput ??= { inputPath, counts };
      if (!input.requireAudio || counts.audioStreams > 0) {
        return { inputPath, counts, checked };
      }
    } catch {
      // Ignore unprobeable files during discovery and continue scanning.
    }
  }

  if (input.requireAudio) {
    throw new Error(
      `No audio-bearing smoke input found in ${directory}. Checked ${checked} media files.`,
    );
  }
  if (firstVideoInput) return { ...firstVideoInput, checked };

  throw new Error(
    `No probeable video smoke input found in ${directory}. Checked ${checked} media files.`,
  );
}

export async function resolveSmokeInput(input) {
  const explicitInput =
    argValue("--input") ?? process.env.LUNARR_TRANSCODE_SMOKE_INPUT;
  if (explicitInput) {
    const inputPath = path.resolve(explicitInput);
    await requireInputFile(inputPath);
    return { inputPath, discoveredFromDirectory: null, checked: 0 };
  }

  const inputDirectory =
    argValue("--input-dir") ?? process.env.LUNARR_TRANSCODE_SMOKE_INPUT_DIR;
  if (inputDirectory) {
    const directory = path.resolve(inputDirectory ?? DEFAULT_INPUT_DIR);
    const discovered = await firstProbeableInputFromDirectory(directory, input);
    return {
      inputPath: discovered.inputPath,
      discoveredFromDirectory: directory,
      checked: discovered.checked,
    };
  }

  return firstAvailableDefaultInput();
}

function playlistSegments(playlist) {
  return playlist
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

async function assertNonEmptyFile(filePath) {
  const details = await stat(filePath);
  if (!details.isFile() || details.size <= 0) {
    throw new Error(`Expected non-empty output file: ${filePath}`);
  }
  return details.size;
}

export function streamCounts(probe) {
  return {
    videoStreams: probe.streams.filter((stream) => stream.type === "video")
      .length,
    audioStreams: probe.streams.filter((stream) => stream.type === "audio")
      .length,
  };
}

function lateSeekSkippedResult(label, durationSeconds) {
  return {
    skipped: true,
    reason:
      `${label} requires at least ${LATE_SEEK_MIN_DURATION_SECONDS}s of media; ` +
      `input duration is ${durationSeconds ?? "unknown"}s.`,
  };
}

function canRunLateSeek(durationSeconds) {
  return (
    durationSeconds === null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds >= LATE_SEEK_MIN_DURATION_SECONDS
  );
}

async function assertProbeHasExpectedStreams(input) {
  const probe = await nodeAvBackend.probe({
    mediaFileId: input.label,
    path: input.filePath,
  });
  const { videoStreams, audioStreams } = streamCounts(probe);
  if (videoStreams <= 0) {
    throw new Error(`${input.label} did not contain a probeable video stream.`);
  }
  if (input.expectAudio && audioStreams <= 0) {
    throw new Error(
      `${input.label} did not preserve a probeable audio stream.`,
    );
  }
  return { probe, videoStreams, audioStreams };
}

export function assertRequestedSegmentReadyBeforeWindowComplete(input) {
  if (input.requestedReadyMs < 0 || input.windowCompleteMs < 0) {
    throw new Error(`${input.label} reported invalid negative timing.`);
  }
  if (input.requestedReadyMs > input.windowCompleteMs) {
    throw new Error(
      `${input.label} requested segment became ready after the bounded window completed.`,
    );
  }
  return input.requestedReadyMs <= input.windowCompleteMs;
}

async function createSeekableFileInputSource(inputPath) {
  const details = await stat(inputPath);
  const handle = await open(inputPath, "r");
  let closed = false;

  return {
    kind: "seekable",
    label: inputPath,
    sizeBytes: details.size,
    format: "mp4",
    async read(start, length) {
      if (closed) throw new Error("Smoke custom input source is closed.");
      const buffer = Buffer.alloc(length);
      const result = await handle.read(buffer, 0, length, start);
      return buffer.subarray(0, result.bytesRead);
    },
    async close() {
      if (closed) return;
      closed = true;
      await handle.close();
    },
  };
}

async function assertPlaylistArtifacts(input) {
  const playlist = await readFile(input.playlistPath, "utf8");
  if (!playlist.includes("#EXTM3U")) {
    throw new Error(`${input.label} playlist is missing #EXTM3U.`);
  }

  const segments = playlistSegments(playlist);
  if (segments.length === 0) {
    throw new Error(
      `${input.label} playlist did not reference any media segments.`,
    );
  }

  for (const segment of segments) {
    if (segment.includes("/") || segment.includes("\\")) {
      throw new Error(
        `${input.label} expected relative segment name, got: ${segment}`,
      );
    }
    await assertNonEmptyFile(path.join(input.artifactDirectory, segment));
  }

  const firstSegmentPath = path.join(input.artifactDirectory, segments[0]);
  const firstSegment = await assertProbeHasExpectedStreams({
    filePath: firstSegmentPath,
    label: `${input.label}-segment`,
    expectAudio: input.expectAudio,
  });

  return {
    playlistSize: await assertNonEmptyFile(input.playlistPath),
    segmentCount: segments.length,
    firstSegmentVideoStreams: firstSegment.videoStreams,
    firstSegmentAudioStreams: firstSegment.audioStreams,
    firstSegmentDurationSeconds: firstSegment.probe.durationSeconds,
  };
}

async function temporarySegmentWindowDirectories(artifactDirectory) {
  return (await readdir(artifactDirectory).catch(() => [])).filter((entry) =>
    entry.startsWith(".segment-window-"),
  );
}

async function assertNoTemporarySegmentWindowDirectories(input) {
  const temporaryDirectories = await temporarySegmentWindowDirectories(
    input.artifactDirectory,
  );
  if (temporaryDirectories.length > 0) {
    throw new Error(
      `${input.label} left temporary request-driven window artifacts: ${temporaryDirectories.join(", ")}`,
    );
  }
  return temporaryDirectories.length;
}

export async function assertSegmentsAbsent(input) {
  const unexpectedSegments = [];
  for (const segment of input.segments) {
    const exists = await stat(path.join(input.artifactDirectory, segment)).then(
      (details) => details.isFile(),
      () => false,
    );
    if (exists) unexpectedSegments.push(segment);
  }
  if (unexpectedSegments.length > 0) {
    throw new Error(
      `${input.label} unexpectedly generated skipped segment(s): ${unexpectedSegments.join(", ")}`,
    );
  }
  return {
    absentSegments: input.segments,
    absentSegmentCount: input.segments.length,
  };
}

async function generateRequestDrivenSmokeWindow(input) {
  const requestedSegment = input.segments[0];
  if (!requestedSegment) {
    throw new Error(
      `${input.label} request-driven smoke window has no requested segment.`,
    );
  }
  const segmentSeconds = requestedSegment.segmentSeconds;
  if (!Number.isFinite(segmentSeconds) || segmentSeconds <= 0) {
    throw new Error(
      `${input.label} request-driven smoke window has an invalid segment duration.`,
    );
  }
  for (const segment of input.segments) {
    if (segment.segmentSeconds !== segmentSeconds) {
      throw new Error(
        `${input.label} request-driven smoke window has mixed segment durations.`,
      );
    }
  }

  const startedAt = performance.now();
  let window;
  try {
    window = await nodeAvBackend.generateHlsSegmentWindow({
      sessionId: input.sessionId,
      mediaFileId: "smoke-input",
      inputPath: input.inputPath,
      inputSource: input.inputSource,
      artifactDirectory: input.artifactDirectory,
      playlistPath: input.playlistPath,
      segments: input.segments,
      segmentSeconds,
      segmentGenerationTimeoutMs: 30_000,
      hardwareAcceleration: "off",
      hardwareAccelerationRequired: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${input.label} failed: ${message}`);
  }
  if (!window?.completion) {
    throw new Error(
      `${input.label} HLS window did not return background completion.`,
    );
  }

  const requestedReadyMs = Math.round(performance.now() - startedAt);
  const requestedSegmentPath = path.join(
    input.artifactDirectory,
    requestedSegment.segment,
  );
  const segmentSize = await assertNonEmptyFile(requestedSegmentPath);
  const segmentProbe = await assertProbeHasExpectedStreams({
    filePath: requestedSegmentPath,
    label: `${input.label}-segment`,
    expectAudio: input.expectAudio,
  });

  try {
    await Promise.race([
      window.completion,
      timeoutAfter(TRANSCODE_TIMEOUT_MS, `${input.label} HLS smoke window`),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${input.label} failed: ${message}`);
  }
  const windowCompleteMs = Math.round(performance.now() - startedAt);
  const temporaryWindowDirectories =
    await assertNoTemporarySegmentWindowDirectories({
      artifactDirectory: input.artifactDirectory,
      label: input.label,
    });
  const readyBeforeWindowComplete =
    assertRequestedSegmentReadyBeforeWindowComplete({
      label: input.label,
      requestedReadyMs,
      windowCompleteMs,
    });

  const lookaheadSegments = [];
  for (const lookahead of input.segments.slice(1)) {
    const lookaheadPath = path.join(input.artifactDirectory, lookahead.segment);
    const lookaheadProbe = await assertProbeHasExpectedStreams({
      filePath: lookaheadPath,
      label: `${input.label}-${lookahead.segment}`,
      expectAudio: input.expectAudio,
    });
    lookaheadSegments.push({
      segment: lookahead.segment,
      size: await assertNonEmptyFile(lookaheadPath),
      videoStreams: lookaheadProbe.videoStreams,
      audioStreams: lookaheadProbe.audioStreams,
      segmentDurationSeconds: lookaheadProbe.probe.durationSeconds,
    });
  }

  return {
    segment: requestedSegment.segment,
    segmentSize,
    segmentVideoStreams: segmentProbe.videoStreams,
    segmentAudioStreams: segmentProbe.audioStreams,
    segmentDurationSeconds: segmentProbe.probe.durationSeconds,
    requestedReadyMs,
    readyBeforeWindowComplete,
    lookaheadSegments,
    temporaryWindowDirectories,
    windowCompleteMs,
  };
}

export async function main() {
  const keepArtifacts = hasArg("--keep");
  const requireAudio = hasArg("--require-audio");
  const { inputPath, discoveredFromDirectory, checked } =
    await resolveSmokeInput({
      requireAudio,
    });

  const artifactRootDirectory = await mkdtemp(
    path.join(tmpdir(), "lunarr-nodeav-smoke-"),
  );
  try {
    const probe = await nodeAvBackend.probe({
      mediaFileId: "smoke-input",
      path: inputPath,
    });
    if (!probe.streams.some((stream) => stream.type === "video")) {
      throw new Error("Smoke input has no video stream.");
    }
    const inputStreams = streamCounts(probe);
    const expectAudio = inputStreams.audioStreams > 0;
    if (requireAudio && !expectAudio) {
      throw new Error(
        "Smoke input has no audio stream. Use --input with an audio-bearing file or omit --require-audio.",
      );
    }

    const encodedArtifactDirectory = path.join(artifactRootDirectory, "encode");
    const running = await nodeAvBackend.startCompatibilityHls({
      sessionId: "smoke-session",
      mediaFileId: "smoke-input",
      inputPath,
      artifactDirectory: encodedArtifactDirectory,
      segmentSeconds: 2,
      mode: "transcode",
      hardwareAcceleration: "off",
      hardwareAccelerationRequired: false,
    });

    await Promise.race([
      running.completion,
      timeoutAfter(TRANSCODE_TIMEOUT_MS, "NodeAV HLS smoke transcode"),
    ]);

    const transcode = await assertPlaylistArtifacts({
      label: "transcode",
      artifactDirectory: encodedArtifactDirectory,
      playlistPath: running.playlistPath,
      expectAudio,
    });

    const remuxArtifactDirectory = path.join(artifactRootDirectory, "remux");
    const remux = await nodeAvBackend.startCompatibilityHls({
      sessionId: "smoke-remux-session",
      mediaFileId: "smoke-input",
      inputPath,
      artifactDirectory: remuxArtifactDirectory,
      segmentSeconds: 2,
      mode: "remux",
      hardwareAcceleration: "off",
      hardwareAccelerationRequired: false,
    });
    await Promise.race([
      remux.completion,
      timeoutAfter(TRANSCODE_TIMEOUT_MS, "NodeAV HLS smoke remux"),
    ]);
    const remuxArtifacts = await assertPlaylistArtifacts({
      label: "remux",
      artifactDirectory: remuxArtifactDirectory,
      playlistPath: remux.playlistPath,
      expectAudio,
    });

    const requestDrivenArtifactDirectory = path.join(
      artifactRootDirectory,
      "request-driven",
    );
    const requestDrivenPlaylistPath = path.join(
      requestDrivenArtifactDirectory,
      "master.m3u8",
    );
    const requestDrivenInitialWindow = await generateRequestDrivenSmokeWindow({
      label: "request-driven-initial",
      sessionId: "smoke-session",
      inputPath,
      artifactDirectory: requestDrivenArtifactDirectory,
      playlistPath: requestDrivenPlaylistPath,
      segments: [
        {
          segment: "segment-00000.ts",
          segmentIndex: 0,
          segmentStartSeconds: 0,
          segmentSeconds: 2,
        },
        {
          segment: "segment-00001.ts",
          segmentIndex: 1,
          segmentStartSeconds: 2,
          segmentSeconds: 2,
        },
      ],
      expectAudio,
    });
    const requestDrivenSeekWindow = await generateRequestDrivenSmokeWindow({
      label: "request-driven-seek",
      sessionId: "smoke-session",
      inputPath,
      artifactDirectory: requestDrivenArtifactDirectory,
      playlistPath: requestDrivenPlaylistPath,
      segments: [
        {
          segment: "segment-00003.ts",
          segmentIndex: 3,
          segmentStartSeconds: 6,
          segmentSeconds: 2,
        },
        {
          segment: "segment-00004.ts",
          segmentIndex: 4,
          segmentStartSeconds: 8,
          segmentSeconds: 2,
        },
      ],
      expectAudio,
    });
    const requestDrivenSecondSeekWindow =
      await generateRequestDrivenSmokeWindow({
        label: "request-driven-second-seek",
        sessionId: "smoke-session",
        inputPath,
        artifactDirectory: requestDrivenArtifactDirectory,
        playlistPath: requestDrivenPlaylistPath,
        segments: [
          {
            segment: "segment-00002.ts",
            segmentIndex: 2,
            segmentStartSeconds: 4,
            segmentSeconds: 2,
          },
          {
            segment: "segment-00003.ts",
            segmentIndex: 3,
            segmentStartSeconds: 6,
            segmentSeconds: 2,
          },
        ],
        expectAudio,
      });
    const requestDrivenLateSeekWindow = canRunLateSeek(probe.durationSeconds)
      ? await generateRequestDrivenSmokeWindow({
          label: "request-driven-late-seek",
          sessionId: "smoke-session",
          inputPath,
          artifactDirectory: requestDrivenArtifactDirectory,
          playlistPath: requestDrivenPlaylistPath,
          segments: [
            {
              segment: "segment-00010.ts",
              segmentIndex: 10,
              segmentStartSeconds: 160,
              segmentSeconds: 16,
            },
            {
              segment: "segment-00011.ts",
              segmentIndex: 11,
              segmentStartSeconds: 176,
              segmentSeconds: 16,
            },
          ],
          expectAudio,
        })
      : lateSeekSkippedResult(
          "request-driven-late-seek",
          probe.durationSeconds,
        );
    const requestDrivenLateSeekSkippedSegments = canRunLateSeek(
      probe.durationSeconds,
    )
      ? await assertSegmentsAbsent({
          label: "request-driven-late-seek",
          artifactDirectory: requestDrivenArtifactDirectory,
          segments: [
            "segment-00005.ts",
            "segment-00006.ts",
            "segment-00007.ts",
            "segment-00008.ts",
            "segment-00009.ts",
          ],
        })
      : lateSeekSkippedResult(
          "request-driven-late-seek-skipped-segments",
          probe.durationSeconds,
        );

    const customIoArtifactDirectory = path.join(
      artifactRootDirectory,
      "custom-io",
    );
    const customIoPlaylistPath = path.join(
      customIoArtifactDirectory,
      "master.m3u8",
    );
    const inputSource = await createSeekableFileInputSource(inputPath);
    let customIoInitialWindow;
    let customIoSeekWindow;
    let customIoSecondSeekWindow;
    let customIoLateSeekWindow;
    try {
      customIoInitialWindow = await generateRequestDrivenSmokeWindow({
        label: "custom-io-initial",
        sessionId: "smoke-custom-io-session",
        inputPath,
        inputSource,
        artifactDirectory: customIoArtifactDirectory,
        playlistPath: customIoPlaylistPath,
        segments: [
          {
            segment: "segment-00001.ts",
            segmentIndex: 1,
            segmentStartSeconds: 2,
            segmentSeconds: 2,
          },
          {
            segment: "segment-00002.ts",
            segmentIndex: 2,
            segmentStartSeconds: 4,
            segmentSeconds: 2,
          },
        ],
        expectAudio,
      });
      customIoSeekWindow = await generateRequestDrivenSmokeWindow({
        label: "custom-io-seek",
        sessionId: "smoke-custom-io-session",
        inputPath,
        inputSource,
        artifactDirectory: customIoArtifactDirectory,
        playlistPath: customIoPlaylistPath,
        segments: [
          {
            segment: "segment-00003.ts",
            segmentIndex: 3,
            segmentStartSeconds: 6,
            segmentSeconds: 2,
          },
          {
            segment: "segment-00004.ts",
            segmentIndex: 4,
            segmentStartSeconds: 8,
            segmentSeconds: 2,
          },
        ],
        expectAudio,
      });
      customIoSecondSeekWindow = await generateRequestDrivenSmokeWindow({
        label: "custom-io-second-seek",
        sessionId: "smoke-custom-io-session",
        inputPath,
        inputSource,
        artifactDirectory: customIoArtifactDirectory,
        playlistPath: customIoPlaylistPath,
        segments: [
          {
            segment: "segment-00000.ts",
            segmentIndex: 0,
            segmentStartSeconds: 0,
            segmentSeconds: 2,
          },
          {
            segment: "segment-00001.ts",
            segmentIndex: 1,
            segmentStartSeconds: 2,
            segmentSeconds: 2,
          },
        ],
        expectAudio,
      });
      customIoLateSeekWindow = canRunLateSeek(probe.durationSeconds)
        ? await generateRequestDrivenSmokeWindow({
            label: "custom-io-late-seek",
            sessionId: "smoke-custom-io-session",
            inputPath,
            inputSource,
            artifactDirectory: customIoArtifactDirectory,
            playlistPath: customIoPlaylistPath,
            segments: [
              {
                segment: "segment-00010.ts",
                segmentIndex: 10,
                segmentStartSeconds: 160,
                segmentSeconds: 16,
              },
              {
                segment: "segment-00011.ts",
                segmentIndex: 11,
                segmentStartSeconds: 176,
                segmentSeconds: 16,
              },
            ],
            expectAudio,
          })
        : lateSeekSkippedResult("custom-io-late-seek", probe.durationSeconds);
    } finally {
      await inputSource.close();
    }
    const customIoLateSeekSkippedSegments = canRunLateSeek(
      probe.durationSeconds,
    )
      ? await assertSegmentsAbsent({
          label: "custom-io-late-seek",
          artifactDirectory: customIoArtifactDirectory,
          segments: [
            "segment-00005.ts",
            "segment-00006.ts",
            "segment-00007.ts",
            "segment-00008.ts",
            "segment-00009.ts",
          ],
        })
      : lateSeekSkippedResult(
          "custom-io-late-seek-skipped-segments",
          probe.durationSeconds,
        );
    const artifactDirectories = await readdir(artifactRootDirectory);

    console.log(
      JSON.stringify(
        {
          ok: true,
          input: inputPath,
          discoveredFromDirectory,
          discoveredMediaFilesChecked: checked,
          artifactRootDirectory,
          playlist: running.playlistPath,
          playlistSize: transcode.playlistSize,
          segmentCount: transcode.segmentCount,
          firstSegmentVideoStreams: transcode.firstSegmentVideoStreams,
          firstSegmentAudioStreams: transcode.firstSegmentAudioStreams,
          remuxPlaylist: remux.playlistPath,
          remuxPlaylistSize: remuxArtifacts.playlistSize,
          remuxSegmentCount: remuxArtifacts.segmentCount,
          remuxFirstSegmentVideoStreams:
            remuxArtifacts.firstSegmentVideoStreams,
          remuxFirstSegmentAudioStreams:
            remuxArtifacts.firstSegmentAudioStreams,
          requestDrivenInitialWindow,
          requestDrivenSeekWindow,
          requestDrivenSecondSeekWindow,
          requestDrivenLateSeekWindow,
          requestDrivenLateSeekSkippedSegments,
          customIoInitialWindow,
          customIoSeekWindow,
          customIoSecondSeekWindow,
          customIoLateSeekWindow,
          customIoLateSeekSkippedSegments,
          artifactDirectories: artifactDirectories.length,
          videoStreams: inputStreams.videoStreams,
          audioStreams: inputStreams.audioStreams,
          audioPreservationChecked: expectAudio,
          requireAudio,
        },
        null,
        2,
      ),
    );
  } finally {
    if (!keepArtifacts) {
      await rm(artifactRootDirectory, { recursive: true, force: true });
    }
  }
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
