import { afterEach, describe, expect, test } from "bun:test";
import {
  ffmpegCliBackend,
  ffmpegHlsArgs,
  resolveFfmpegPath,
  resolvedFfmpegPath,
  scheduleForceKill,
} from "./ffmpeg-cli";
import type { HlsSegmentWindowTranscodeInput, HlsTranscodeInput, SeekableTranscodeInputSource } from "./backend";
import { open, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { hlsPlaylistSegmentEntries } from "./hls";
import { encodeEventPlaylistPath, encodeFmp4InitFileName } from "./encode-coordinator";

let tempDir = "";

afterEach(async () => {
  if (!tempDir) return;
  await rm(tempDir, { recursive: true, force: true });
  tempDir = "";
});

function canRunFfmpeg() {
  const result = spawnSync(resolvedFfmpegPath(), ["-version"], {
    stdio: "ignore",
  });
  return !result.error && result.status === 0;
}

async function makeTempDir() {
  tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-ffmpeg-cli-"));
  return tempDir;
}

function runFfmpegFixture(args: string[]) {
  const result = spawnSync(resolvedFfmpegPath(), args, {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `Fixture FFmpeg failed: ${result.stderr || result.stdout || result.error?.message || "unknown error"}`,
    );
  }
}

async function generateSmokeInput(
  inputPath: string,
  options: { durationSeconds?: number; size?: string; rate?: number } = {},
) {
  runFfmpegFixture([
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=${options.size ?? "160x90"}:rate=${options.rate ?? 15}`,
    "-t",
    String(options.durationSeconds ?? 3),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    inputPath,
  ]);
}

async function createFileInputSource(
  filePath: string,
  onClose?: () => void,
  options: { readDelayMs?: number } = {},
): Promise<SeekableTranscodeInputSource> {
  const details = await stat(filePath);
  const handle = await open(filePath, "r");
  let closed = false;
  const readDelayMs = Math.max(0, options.readDelayMs ?? 0);
  return {
    kind: "seekable",
    label: filePath,
    sizeBytes: details.size,
    format: "mp4",
    async read(start, length) {
      if (closed) throw new Error("Smoke input source is closed.");
      if (readDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, readDelayMs));
      }
      const buffer = Buffer.alloc(length);
      const result = await handle.read(buffer, 0, length, start);
      return buffer.subarray(0, result.bytesRead);
    },
    async close() {
      if (closed) return;
      closed = true;
      onClose?.();
      await handle.close();
    },
  };
}

function smokeWindowInput(overrides: Partial<HlsSegmentWindowTranscodeInput> = {}): HlsSegmentWindowTranscodeInput {
  return {
    ...input(),
    inputPath: "/tmp/source.mp4",
    artifactDirectory: "/tmp/lunarr-hls",
    playlistPath: "/tmp/lunarr-hls/master.m3u8",
    segmentSeconds: 1,
    segmentGenerationTimeoutMs: 30_000,
    segments: [
      {
        segment: "segment-00000.ts",
        segmentIndex: 0,
        segmentStartSeconds: 0,
        segmentSeconds: 1,
      },
    ],
    ...overrides,
  };
}

async function expectGeneratedSegment(artifactDirectory: string, segment = "segment-00000.ts") {
  const segmentPath = path.join(artifactDirectory, segment);
  const details = await stat(segmentPath);
  expect(details.isFile()).toBe(true);
  expect(details.size).toBeGreaterThan(0);
  return readFile(segmentPath);
}

function input(overrides: Partial<HlsTranscodeInput> = {}): HlsTranscodeInput {
  return {
    sessionId: "session-1",
    mediaFileId: "file-1",
    inputPath: "/media/Movie.mkv",
    artifactDirectory: "/tmp/lunarr-hls",
    segmentSeconds: 16,
    mode: "transcode",
    hardwareAcceleration: "off",
    hardwareAccelerationRequired: false,
    ...overrides,
  };
}

describe("FFmpeg HLS playback backend", () => {
  test("resolves FFmpeg from explicit config, system binary, then bundled fallback", () => {
    const executable = new Set(["ffmpeg", "/opt/node-av/ffmpeg"]);
    const canExecute = (binaryPath: string) => executable.has(binaryPath);

    expect(
      resolveFfmpegPath({
        configuredPath: "/custom/ffmpeg",
        bundledPath: "/opt/node-av/ffmpeg",
        canExecute,
      }),
    ).toBe("/custom/ffmpeg");
    expect(
      resolveFfmpegPath({
        bundledPath: "/opt/node-av/ffmpeg",
        canExecute,
      }),
    ).toBe("ffmpeg");
    expect(
      resolveFfmpegPath({
        bundledPath: "/opt/node-av/ffmpeg",
        canExecute: (binaryPath) => binaryPath === "/opt/node-av/ffmpeg",
      }),
    ).toBe("/opt/node-av/ffmpeg");
  });

  test("falls back to the system command name when no candidate is executable", () => {
    expect(
      resolveFfmpegPath({
        bundledPath: "/opt/node-av/ffmpeg",
        canExecute: () => false,
      }),
    ).toBe("ffmpeg");
  });

  test("escalates cancelled FFmpeg processes from SIGTERM to SIGKILL", async () => {
    const signals: string[] = [];
    const process = {
      exitCode: null,
      signalCode: null,
      kill(signal: NodeJS.Signals) {
        signals.push(signal);
        return true;
      },
    };

    const forceKill = scheduleForceKill(process, 5);
    await new Promise((resolve) => setTimeout(resolve, 20));
    clearTimeout(forceKill);

    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  test("does not force-kill FFmpeg processes that exit during the grace window", async () => {
    const signals: string[] = [];
    const process = {
      exitCode: null as number | null,
      signalCode: null,
      kill(signal: NodeJS.Signals) {
        signals.push(signal);
        return true;
      },
    };

    const forceKill = scheduleForceKill(process, 10);
    process.exitCode = 0;
    await new Promise((resolve) => setTimeout(resolve, 20));
    clearTimeout(forceKill);

    expect(signals).toEqual(["SIGTERM"]);
  });

  test("builds a transcode HLS command", () => {
    expect(ffmpegHlsArgs(input({ startTimeSeconds: 42 }))).toEqual([
      "-hide_banner",
      "-y",
      "-ss",
      "42",
      "-i",
      "/media/Movie.mkv",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-sn",
      "-dn",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "480",
      "-keyint_min",
      "480",
      "-sc_threshold",
      "0",
      "-force_key_frames",
      "expr:gte(t,n_forced*16)",
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-max_muxing_queue_size",
      "2048",
      "-avoid_negative_ts",
      "make_zero",
      "-f",
      "hls",
      "-hls_time",
      "16",
      "-hls_list_size",
      "0",
      "-hls_playlist_type",
      "event",
      "-hls_flags",
      "independent_segments+temp_file",
      "-hls_segment_filename",
      "/tmp/lunarr-hls/segment-%05d.ts",
      "/tmp/lunarr-hls/master.m3u8",
    ]);
  });

  test("uses a per-job event playlist when startSegmentNumber is set", () => {
    const artifactDirectory = "/tmp/lunarr-hls";
    const args = ffmpegHlsArgs(input({ artifactDirectory }), { startSegmentNumber: 5 });
    expect(args.at(-1)).toBe(path.join(artifactDirectory, "encode-session-1-5.m3u8"));
  });

  test("uses a per-job fMP4 init file when startSegmentNumber is set", () => {
    const args = ffmpegHlsArgs(input({ hlsSegmentFormat: "fmp4" }), { startSegmentNumber: 5 });
    expect(args.slice(args.indexOf("-hls_fmp4_init_filename"), args.indexOf("-hls_fmp4_init_filename") + 2)).toEqual([
      "-hls_fmp4_init_filename",
      "encode-session-1-5-init.mp4",
    ]);
  });

  test("builds a remux HLS command without re-encoding", () => {
    expect(ffmpegHlsArgs(input({ mode: "remux", startTimeSeconds: 0 }))).toEqual([
      "-hide_banner",
      "-y",
      "-i",
      "/media/Movie.mkv",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-sn",
      "-dn",
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      "-max_muxing_queue_size",
      "2048",
      "-avoid_negative_ts",
      "make_zero",
      "-f",
      "hls",
      "-hls_time",
      "16",
      "-hls_list_size",
      "0",
      "-hls_playlist_type",
      "event",
      "-hls_flags",
      "temp_file",
      "-hls_segment_filename",
      "/tmp/lunarr-hls/segment-%05d.ts",
      "/tmp/lunarr-hls/master.m3u8",
    ]);
  });

  test("builds an fMP4 HLS command when requested", () => {
    const args = ffmpegHlsArgs(
      input({
        hlsSegmentFormat: "fmp4",
      }),
    );

    expect(args).toContain("-hls_segment_type");
    expect(args.slice(args.indexOf("-hls_segment_type"), args.indexOf("-hls_segment_type") + 2)).toEqual([
      "-hls_segment_type",
      "fmp4",
    ]);
    expect(args.slice(args.indexOf("-hls_fmp4_init_filename"), args.indexOf("-hls_fmp4_init_filename") + 2)).toEqual([
      "-hls_fmp4_init_filename",
      "init.mp4",
    ]);
    expect(args.slice(args.indexOf("-hls_segment_filename") + 1)).toEqual([
      "/tmp/lunarr-hls/segment-%05d.m4s",
      "/tmp/lunarr-hls/master.m3u8",
    ]);
  });

  test("maps a selected audio stream by input stream index", () => {
    const args = ffmpegHlsArgs(input({ audioStreamIndex: 3 }));
    expect(args.slice(args.indexOf("-map"), args.indexOf("-sn"))).toEqual(["-map", "0:v:0", "-map", "0:3?"]);
  });

  test("applies software transcode quality targets", () => {
    const args = ffmpegHlsArgs(
      input({
        transcodeQuality: {
          preset: "720p",
          maxHeight: 720,
          softwareCrf: 24,
          hardwareBitrate: "3M",
        },
      }),
    );

    expect(args).toContain("-vf");
    expect(args).toContain("scale=-2:trunc(min(ih\\,720)/2)*2");
    expect(args.slice(args.indexOf("-crf"), args.indexOf("-crf") + 2)).toEqual(["-crf", "24"]);
  });

  test("builds a hardware transcode HLS command for explicit acceleration", () => {
    expect(
      ffmpegHlsArgs(
        input({
          hardwareAcceleration: "videotoolbox",
          hardwareAccelerationRequired: true,
        }),
      ),
    ).toEqual([
      "-hide_banner",
      "-y",
      "-hwaccel",
      "videotoolbox",
      "-i",
      "/media/Movie.mkv",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-sn",
      "-dn",
      "-c:v",
      "h264_videotoolbox",
      "-b:v",
      "5M",
      "-g",
      "480",
      "-keyint_min",
      "480",
      "-force_key_frames",
      "expr:gte(t,n_forced*16)",
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-max_muxing_queue_size",
      "2048",
      "-avoid_negative_ts",
      "make_zero",
      "-f",
      "hls",
      "-hls_time",
      "16",
      "-hls_list_size",
      "0",
      "-hls_playlist_type",
      "event",
      "-hls_flags",
      "independent_segments+temp_file",
      "-hls_segment_filename",
      "/tmp/lunarr-hls/segment-%05d.ts",
      "/tmp/lunarr-hls/master.m3u8",
    ]);
  });

  test("applies hardware transcode quality targets", () => {
    const args = ffmpegHlsArgs(
      input({
        hardwareAcceleration: "nvenc",
        hardwareAccelerationRequired: true,
        transcodeQuality: {
          preset: "720p",
          maxHeight: 720,
          softwareCrf: 24,
          hardwareBitrate: "3M",
        },
      }),
    );

    expect(args).toContain("h264_nvenc");
    expect(args).toContain("scale=-2:trunc(min(ih\\,720)/2)*2");
    expect(args.slice(args.indexOf("-b:v"), args.indexOf("-b:v") + 2)).toEqual(["-b:v", "3M"]);
  });

  test("keeps automatic hardware acceleration on software unless required", () => {
    expect(
      ffmpegHlsArgs(
        input({
          hardwareAcceleration: "auto",
          hardwareAccelerationRequired: false,
        }),
      ),
    ).toContain("libx264");
    expect(
      ffmpegHlsArgs(
        input({
          hardwareAcceleration: "auto",
          hardwareAccelerationRequired: true,
        }),
      ),
    ).not.toContain("libx264");
  });

  test("uses a private proxy URL for seekable input sources", () => {
    expect(
      ffmpegHlsArgs(
        input({
          inputSource: {
            kind: "seekable",
            label: "sftp input",
            sizeBytes: 1024,
            async read() {
              return Buffer.alloc(0);
            },
            async close() {
              return;
            },
          },
        }),
        { inputUrl: "http://127.0.0.1:12345/input/session-1?token=secret" },
      ),
    ).toContain("http://127.0.0.1:12345/input/session-1?token=secret");
  });

  test("can start HLS output numbering at the requested segment", () => {
    expect(ffmpegHlsArgs(input(), { startSegmentNumber: 42 })).toContain("42");
    expect(ffmpegHlsArgs(input(), { startSegmentNumber: 42 })).toContain("-start_number");
  });

  test("requires a proxy URL for seekable input sources", () => {
    expect(() =>
      ffmpegHlsArgs(
        input({
          inputSource: {
            kind: "seekable",
            label: "sftp input",
            sizeBytes: 1024,
            async read() {
              return Buffer.alloc(0);
            },
            async close() {
              return;
            },
          },
        }),
      ),
    ).toThrow("FFmpeg input proxy URL is missing.");
  });

  test("does not reject required hardware acceleration as unsupported by the backend", () => {
    let message = "";
    try {
      ffmpegCliBackend.validateHlsSegmentGenerationPolicy?.({
        hardwareAcceleration: "videotoolbox",
        hardwareAccelerationRequired: true,
        mode: "transcode",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      message = (error as Error).message;
    }
    expect(message).not.toContain("Required hardware acceleration is not available for FFmpeg CLI playback yet.");
  });

  const smokeTest = canRunFfmpeg() ? test : test.skip;

  smokeTest("generates real HLS segments from local and proxied seekable inputs", async () => {
    const directory = await makeTempDir();
    const sourcePath = path.join(directory, "source.mp4");
    await generateSmokeInput(sourcePath);

    const localArtifactDirectory = path.join(directory, "local-hls");
    await mkdir(localArtifactDirectory, { recursive: true });
    const localGeneration = await ffmpegCliBackend.generateHlsSegmentWindow?.(
      smokeWindowInput({
        sessionId: "local-smoke",
        inputPath: sourcePath,
        artifactDirectory: localArtifactDirectory,
        playlistPath: path.join(localArtifactDirectory, "master.m3u8"),
      }),
    );
    await localGeneration?.completion;
    expect((await expectGeneratedSegment(localArtifactDirectory)).length).toBeGreaterThan(0);

    const seekArtifactDirectory = path.join(directory, "seek-hls");
    await mkdir(seekArtifactDirectory, { recursive: true });
    const seekGeneration = await ffmpegCliBackend.generateHlsSegmentWindow?.(
      smokeWindowInput({
        sessionId: "seek-smoke",
        inputPath: sourcePath,
        artifactDirectory: seekArtifactDirectory,
        playlistPath: path.join(seekArtifactDirectory, "master.m3u8"),
        segments: [
          {
            segment: "segment-00001.ts",
            segmentIndex: 1,
            segmentStartSeconds: 1,
            segmentSeconds: 1,
          },
        ],
      }),
    );
    await seekGeneration?.completion;
    expect((await expectGeneratedSegment(seekArtifactDirectory, "segment-00001.ts")).length).toBeGreaterThan(0);

    const proxiedArtifactDirectory = path.join(directory, "proxied-hls");
    await mkdir(proxiedArtifactDirectory, { recursive: true });
    const source = await createFileInputSource(sourcePath);
    try {
      const proxiedGeneration = await ffmpegCliBackend.generateHlsSegmentWindow?.(
        smokeWindowInput({
          sessionId: "proxied-smoke",
          inputPath: sourcePath,
          inputSource: source,
          artifactDirectory: proxiedArtifactDirectory,
          playlistPath: path.join(proxiedArtifactDirectory, "master.m3u8"),
        }),
      );
      await proxiedGeneration?.completion;
      expect((await expectGeneratedSegment(proxiedArtifactDirectory)).length).toBeGreaterThan(0);
    } finally {
      await source.close();
    }
  });

  smokeTest("generates HLS when the virtual playlist path differs from the cache directory", async () => {
    const directory = await makeTempDir();
    const sourcePath = path.join(directory, "source.mp4");
    await generateSmokeInput(sourcePath);

    const artifactDirectory = path.join(directory, "playback-cache", "cache-key");
    const sessionDirectory = path.join(directory, "playback-sessions", "session-1");
    await mkdir(artifactDirectory, { recursive: true });
    await mkdir(sessionDirectory, { recursive: true });
    const virtualPlaylistPath = path.join(sessionDirectory, "master.m3u8");
    await writeFile(
      virtualPlaylistPath,
      ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-PLAYLIST-TYPE:VOD", "#EXT-X-TARGETDURATION:16", ""].join("\n"),
    );

    const generation = await ffmpegCliBackend.generateHlsSegmentWindow?.(
      smokeWindowInput({
        sessionId: "session-playlist-split-smoke",
        inputPath: sourcePath,
        artifactDirectory,
        playlistPath: virtualPlaylistPath,
      }),
    );
    await generation?.completion;
    expect((await expectGeneratedSegment(artifactDirectory)).length).toBeGreaterThan(0);
    const eventPlaylistPath = encodeEventPlaylistPath(artifactDirectory, "session-playlist-split-smoke", 0);
    const eventPlaylist = await readFile(eventPlaylistPath, "utf8");
    expect(hlsPlaylistSegmentEntries(eventPlaylist, eventPlaylistPath)).toEqual(
      expect.arrayContaining([expect.objectContaining({ segment: "segment-00000.ts" })]),
    );
  });

  smokeTest("generates real copied-remux HLS with event timing", async () => {
    const directory = await makeTempDir();
    const sourcePath = path.join(directory, "source.mp4");
    await generateSmokeInput(sourcePath);

    const artifactDirectory = path.join(directory, "remux-hls");
    const eventPlaylistPath = encodeEventPlaylistPath(artifactDirectory, "remux-smoke", 0);
    await mkdir(artifactDirectory, { recursive: true });
    const generation = await ffmpegCliBackend.generateHlsSegmentWindow?.(
      smokeWindowInput({
        sessionId: "remux-smoke",
        inputPath: sourcePath,
        artifactDirectory,
        playlistPath: eventPlaylistPath,
        mode: "remux",
      }),
    );
    await generation?.completion;

    expect((await expectGeneratedSegment(artifactDirectory, "segment-00000.ts")).length).toBeGreaterThan(0);
    const playlist = await readFile(eventPlaylistPath, "utf8");
    const entries = hlsPlaylistSegmentEntries(playlist, eventPlaylistPath);
    expect(playlist).toContain("#EXT-X-PLAYLIST-TYPE:EVENT");
    expect(entries[0]).toMatchObject({
      segment: "segment-00000.ts",
      segmentIndex: 0,
      sequenceNumber: 0,
    });
    expect(entries[0]?.durationSeconds).toBeGreaterThan(0);
  });

  smokeTest("generates real fMP4 HLS init and segment artifacts", async () => {
    const directory = await makeTempDir();
    const sourcePath = path.join(directory, "source.mp4");
    await generateSmokeInput(sourcePath);

    const artifactDirectory = path.join(directory, "fmp4-hls");
    await mkdir(artifactDirectory, { recursive: true });
    const generation = await ffmpegCliBackend.generateHlsSegmentWindow?.(
      smokeWindowInput({
        sessionId: "fmp4-smoke",
        inputPath: sourcePath,
        artifactDirectory,
        playlistPath: path.join(artifactDirectory, "master.m3u8"),
        hlsSegmentFormat: "fmp4",
        segments: [
          {
            segment: "segment-00000.m4s",
            segmentIndex: 0,
            segmentStartSeconds: 0,
            segmentSeconds: 1,
          },
        ],
      }),
    );
    await generation?.completion;

    expect(
      (await expectGeneratedSegment(artifactDirectory, encodeFmp4InitFileName("fmp4-smoke", 0))).length,
    ).toBeGreaterThan(0);
    expect((await expectGeneratedSegment(artifactDirectory, "segment-00000.m4s")).length).toBeGreaterThan(0);
    const eventPlaylistPath = encodeEventPlaylistPath(artifactDirectory, "fmp4-smoke", 0);
    expect(await readFile(eventPlaylistPath, "utf8")).toContain(
      `#EXT-X-MAP:URI="${encodeFmp4InitFileName("fmp4-smoke", 0)}"`,
    );
  });

  smokeTest(
    "reuses an active proxied FFmpeg stream for same-session forward segment requests",
    async () => {
      await ffmpegCliBackend.cancel?.("reuse-smoke");

      const directory = await makeTempDir();
      const sourcePath = path.join(directory, "source.mp4");
      await generateSmokeInput(sourcePath, {
        durationSeconds: 30,
        size: "640x360",
        rate: 24,
      });
      const artifactDirectory = path.join(directory, "reuse-hls");
      await mkdir(artifactDirectory, { recursive: true });
      const segmentSeconds = 4;

      const firstSource = await createFileInputSource(sourcePath, undefined, {
        readDelayMs: 80,
      });
      let replacementSourceCloseCount = 0;
      const replacementSource = await createFileInputSource(
        sourcePath,
        () => {
          replacementSourceCloseCount += 1;
        },
        { readDelayMs: 80 },
      );

      try {
        const firstGeneration = await ffmpegCliBackend.generateHlsSegmentWindow?.(
          smokeWindowInput({
            sessionId: "reuse-smoke",
            inputPath: sourcePath,
            inputSource: firstSource,
            artifactDirectory,
            playlistPath: path.join(artifactDirectory, "master.m3u8"),
            segmentSeconds,
            encodeAheadSegmentCount: 6,
            segments: [
              {
                segment: "segment-00000.ts",
                segmentIndex: 0,
                segmentStartSeconds: 0,
                segmentSeconds,
              },
            ],
          }),
        );
        void firstGeneration?.completion.catch(() => undefined);
        expect((await expectGeneratedSegment(artifactDirectory, "segment-00000.ts")).length).toBeGreaterThan(0);

        const secondGeneration = await ffmpegCliBackend.generateHlsSegmentWindow?.(
          smokeWindowInput({
            sessionId: "reuse-smoke",
            inputPath: sourcePath,
            inputSource: replacementSource,
            artifactDirectory,
            playlistPath: path.join(artifactDirectory, "master.m3u8"),
            segmentSeconds,
            segments: [
              {
                segment: "segment-00001.ts",
                segmentIndex: 1,
                segmentStartSeconds: segmentSeconds,
                segmentSeconds,
              },
            ],
          }),
        );

        expect(secondGeneration?.inputSourceDisposition).toBe("backend");
        expect(replacementSourceCloseCount).toBe(1);
        expect((await expectGeneratedSegment(artifactDirectory, "segment-00001.ts")).length).toBeGreaterThan(0);

        await ffmpegCliBackend.cancel?.("reuse-smoke");
        await firstGeneration?.completion.catch(() => undefined);
        await secondGeneration?.completion.catch(() => undefined);
      } finally {
        await ffmpegCliBackend.cancel?.("reuse-smoke");
        await firstSource.close().catch(() => undefined);
        await replacementSource.close().catch(() => undefined);
      }
    },
    30_000,
  );
});
