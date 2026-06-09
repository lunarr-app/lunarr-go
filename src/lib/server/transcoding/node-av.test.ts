import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expectRejectsToThrow } from "$lib/test/async-expect";
import {
  activeSegmentGenerationCountForTests,
  getNodeAvBackendStatus,
  NodeAvBackendError,
  nodeAvBackend,
  registerActiveSegmentGenerationForTests,
  setNodeAvModuleLoaderForTests,
  validateGeneratedHlsSegmentProbe,
} from "./node-av";

describe("NodeAV generated HLS segment validation", () => {
  afterEach(() => {
    setNodeAvModuleLoaderForTests(null);
  });

  test("cancels active request-driven segment generation", async () => {
    const sessionId = "segment-cancel-test";
    const signal = registerActiveSegmentGenerationForTests(sessionId);

    expect(signal.aborted).toBe(false);
    expect(activeSegmentGenerationCountForTests(sessionId)).toBe(1);

    await nodeAvBackend.cancel(sessionId);
    await Promise.resolve();

    expect(signal.aborted).toBe(true);
    expect(activeSegmentGenerationCountForTests(sessionId)).toBe(0);
  });

  test("aborts request-driven segment generation while NodeAV modules are loading", async () => {
    const sessionId = "segment-module-load-cancel-test";
    const controller = new AbortController();
    let moduleLoadStarted = false;
    setNodeAvModuleLoaderForTests(
      () =>
        new Promise<never>(() => {
          moduleLoadStarted = true;
        }),
    );

    const generation = nodeAvBackend.generateHlsSegmentWindow?.({
      sessionId,
      mediaFileId: "media-file",
      inputPath: "/tmp/movie.mkv",
      artifactDirectory: "/tmp/lunarr-nodeav-cancel-test",
      playlistPath: "/tmp/lunarr-nodeav-cancel-test/master.m3u8",
      segments: [
        {
          segment: "segment-00000.ts",
          segmentIndex: 0,
          segmentStartSeconds: 0,
          segmentSeconds: 4,
        },
      ],
      segmentSeconds: 4,
      segmentGenerationTimeoutMs: 1_000,
      hardwareAcceleration: "off",
      hardwareAccelerationRequired: false,
      signal: controller.signal,
    });
    if (!generation) throw new Error("Expected segment generation backend.");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(moduleLoadStarted).toBe(true);
    expect(activeSegmentGenerationCountForTests(sessionId)).toBe(0);

    controller.abort();

    await expectRejectsToThrow(
      generation,
      "NodeAV HLS operation was cancelled.",
    );
    expect(activeSegmentGenerationCountForTests(sessionId)).toBe(0);
  });

  test("does not reuse a cancelled pending NodeAV module load", async () => {
    const sessionId = "segment-module-load-retry-test";
    const controller = new AbortController();
    let loadCount = 0;
    let moduleLoadStarted = false;
    setNodeAvModuleLoaderForTests(() => {
      loadCount += 1;
      if (loadCount === 1) {
        return new Promise<never>(() => {
          moduleLoadStarted = true;
        });
      }
      return Promise.resolve({
        api: {} as never,
        constants: {
          FF_ENCODER_AAC: "aac",
          FF_ENCODER_LIBX264: "libx264",
        } as never,
        lib: {
          Codec: {
            findEncoderByName: () => ({}),
          },
        } as never,
      });
    });

    const generation = nodeAvBackend.generateHlsSegmentWindow?.({
      sessionId,
      mediaFileId: "media-file",
      inputPath: "/tmp/movie.mkv",
      artifactDirectory: "/tmp/lunarr-nodeav-cancel-retry-test",
      playlistPath: "/tmp/lunarr-nodeav-cancel-retry-test/master.m3u8",
      segments: [
        {
          segment: "segment-00000.ts",
          segmentIndex: 0,
          segmentStartSeconds: 0,
          segmentSeconds: 4,
        },
      ],
      segmentSeconds: 4,
      segmentGenerationTimeoutMs: 1_000,
      hardwareAcceleration: "off",
      hardwareAccelerationRequired: false,
      signal: controller.signal,
    });
    if (!generation) throw new Error("Expected segment generation backend.");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(moduleLoadStarted).toBe(true);

    controller.abort();
    await expectRejectsToThrow(
      generation,
      "NodeAV HLS operation was cancelled.",
    );

    const status = await Promise.race([
      getNodeAvBackendStatus(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("NodeAV backend status retry timed out.")),
          100,
        ),
      ),
    ]);
    expect(status.available).toBe(true);
    expect(loadCount).toBe(2);
  });

  test("keeps optional hardware policy validation cheap before NodeAV loads", async () => {
    let moduleLoadStarted = false;
    setNodeAvModuleLoaderForTests(
      () =>
        new Promise<never>(() => {
          moduleLoadStarted = true;
        }),
    );

    await nodeAvBackend.validateHlsSegmentGenerationPolicy?.({
      hardwareAcceleration: "videotoolbox",
      hardwareAccelerationRequired: false,
    });
    expect(moduleLoadStarted).toBe(false);
  });

  test("rejects required hardware policy validation when hardware is unavailable", async () => {
    let moduleLoadCount = 0;
    setNodeAvModuleLoaderForTests(async () => {
      moduleLoadCount += 1;
      return {
        api: {
          HardwareContext: {
            create: () => null,
          },
        } as never,
        constants: {
          FF_ENCODER_AAC: "aac",
          FF_ENCODER_LIBX264: "libx264",
          FF_HWDEVICE_TYPE_VIDEOTOOLBOX: "videotoolbox",
        } as never,
        lib: {
          Codec: {
            findEncoderByName: () => ({}),
          },
        } as never,
      };
    });

    await expectRejectsToThrow(
      nodeAvBackend.validateHlsSegmentGenerationPolicy?.({
        hardwareAcceleration: "videotoolbox",
        hardwareAccelerationRequired: true,
      }),
      'Hardware acceleration "videotoolbox" is required, but NodeAV could not create a hardware device.',
    );
    expect(moduleLoadCount).toBe(1);
  });

  test("rejects required hardware segment generation when hardware is unavailable", async () => {
    const artifactDirectory = await mkdtemp(
      path.join(tmpdir(), "lunarr-nodeav-hardware-required-"),
    );
    let moduleLoadCount = 0;
    setNodeAvModuleLoaderForTests(async () => {
      moduleLoadCount += 1;
      return {
        api: {
          HardwareContext: {
            create: () => null,
          },
        } as never,
        constants: {
          FF_ENCODER_AAC: "aac",
          FF_ENCODER_LIBX264: "libx264",
          FF_HWDEVICE_TYPE_VIDEOTOOLBOX: "videotoolbox",
        } as never,
        lib: {
          Codec: {
            findEncoderByName: () => ({}),
          },
        } as never,
      };
    });

    try {
      const generation = nodeAvBackend.generateHlsSegmentWindow?.({
        sessionId: "hardware-required-segment-test",
        mediaFileId: "media-file",
        inputPath: "/tmp/movie.mkv",
        artifactDirectory,
        playlistPath: path.join(artifactDirectory, "master.m3u8"),
        segments: [
          {
            segment: "segment-00000.ts",
            segmentIndex: 0,
            segmentStartSeconds: 0,
            segmentSeconds: 4,
          },
        ],
        segmentSeconds: 4,
        segmentGenerationTimeoutMs: 1_000,
        hardwareAcceleration: "videotoolbox",
        hardwareAccelerationRequired: true,
      });
      if (!generation) throw new Error("Expected segment generation backend.");

      await expectRejectsToThrow(
        generation,
        'Hardware acceleration "videotoolbox" is required, but NodeAV could not create a hardware device.',
      );
      expect(moduleLoadCount).toBe(1);
    } finally {
      await rm(artifactDirectory, { recursive: true, force: true });
    }
  });

  async function temporarySegmentWindowDirectories(artifactDirectory: string) {
    return (await readdir(artifactDirectory).catch(() => [])).filter((entry) =>
      entry.startsWith(".segment-window-"),
    );
  }

  function setHangingPipelineNodeAvModules(onPipelineStarted: () => void) {
    setNodeAvModuleLoaderForTests(async () => ({
      api: {
        Demuxer: {
          open: async () => ({
            audio: () => null,
            close: async () => undefined,
            video: () => ({}),
          }),
        },
        Decoder: {
          create: async () => ({ close: () => undefined }),
        },
        Encoder: {
          create: async () => ({ close: () => undefined }),
        },
        FilterAPI: {
          create: () => ({ close: () => undefined }),
        },
        HardwareContext: {
          auto: () => null,
          create: () => null,
        },
        Muxer: {
          open: async () => ({}),
        },
        pipeline: (
          _demuxer: unknown,
          _stages: unknown,
          _output: unknown,
          options: unknown,
        ) => {
          onPipelineStarted();
          const signal = (options as { signal?: AbortSignal }).signal;
          return {
            completion: new Promise<void>((_, reject) => {
              signal?.addEventListener(
                "abort",
                () => reject(new Error("pipeline cancelled")),
                { once: true },
              );
            }),
          };
        },
      } as never,
      constants: {
        AV_LOG_QUIET: 0,
        FF_ENCODER_AAC: "aac",
        FF_ENCODER_LIBX264: "libx264",
        FF_HWDEVICE_TYPE_AMF: "amf",
        FF_HWDEVICE_TYPE_CUDA: "cuda",
        FF_HWDEVICE_TYPE_QSV: "qsv",
        FF_HWDEVICE_TYPE_VAAPI: "vaapi",
        FF_HWDEVICE_TYPE_VIDEOTOOLBOX: "videotoolbox",
      } as never,
      lib: {
        Codec: {
          findEncoderByName: () => ({}),
        },
        Log: {
          setLevel: () => undefined,
        },
      } as never,
    }));
  }

  test("aborts bounded segment waiting and removes temporary window artifacts when the generation signal is cancelled", async () => {
    const sessionId = "segment-wait-cancel-test";
    const artifactDirectory = await mkdtemp(
      path.join(tmpdir(), "lunarr-nodeav-wait-cancel-"),
    );
    const controller = new AbortController();
    let pipelineStarted!: () => void;
    const pipelineStartedPromise = new Promise<void>((resolve) => {
      pipelineStarted = resolve;
    });
    setHangingPipelineNodeAvModules(pipelineStarted);

    try {
      const generation = nodeAvBackend.generateHlsSegmentWindow?.({
        sessionId,
        mediaFileId: "media-file",
        inputPath: "/tmp/movie.mkv",
        artifactDirectory,
        playlistPath: path.join(artifactDirectory, "master.m3u8"),
        segments: [
          {
            segment: "segment-00000.ts",
            segmentIndex: 0,
            segmentStartSeconds: 0,
            segmentSeconds: 4,
          },
        ],
        segmentSeconds: 4,
        segmentGenerationTimeoutMs: 1_000,
        hardwareAcceleration: "off",
        hardwareAccelerationRequired: false,
        signal: controller.signal,
      });
      if (!generation) throw new Error("Expected segment generation backend.");
      await pipelineStartedPromise;

      controller.abort();

      await expectRejectsToThrow(
        Promise.race([
          generation,
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(new Error("Segment generation cancellation timed out.")),
              100,
            ),
          ),
        ]),
        "NodeAV HLS operation was cancelled.",
      );
      for (let index = 0; index < 10; index += 1) {
        if (activeSegmentGenerationCountForTests(sessionId) === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(activeSegmentGenerationCountForTests(sessionId)).toBe(0);
      expect(
        await temporarySegmentWindowDirectories(artifactDirectory),
      ).toEqual([]);
    } finally {
      await rm(artifactDirectory, { recursive: true, force: true });
    }
  });

  test("backend cancellation removes temporary window artifacts for request-driven generation", async () => {
    const sessionId = "segment-backend-cancel-test";
    const artifactDirectory = await mkdtemp(
      path.join(tmpdir(), "lunarr-nodeav-backend-cancel-"),
    );
    let pipelineStarted!: () => void;
    const pipelineStartedPromise = new Promise<void>((resolve) => {
      pipelineStarted = resolve;
    });
    setHangingPipelineNodeAvModules(pipelineStarted);

    try {
      const generation = nodeAvBackend.generateHlsSegmentWindow?.({
        sessionId,
        mediaFileId: "media-file",
        inputPath: "/tmp/movie.mkv",
        artifactDirectory,
        playlistPath: path.join(artifactDirectory, "master.m3u8"),
        segments: [
          {
            segment: "segment-00000.ts",
            segmentIndex: 0,
            segmentStartSeconds: 0,
            segmentSeconds: 4,
          },
        ],
        segmentSeconds: 4,
        segmentGenerationTimeoutMs: 1_000,
        hardwareAcceleration: "off",
        hardwareAccelerationRequired: false,
      });
      if (!generation) throw new Error("Expected segment generation backend.");
      await pipelineStartedPromise;
      expect(activeSegmentGenerationCountForTests(sessionId)).toBe(1);

      const rejectedGeneration = generation.then(
        () => {
          throw new Error("Expected segment generation to reject.");
        },
        (error: unknown) => error,
      );
      const cancellation = nodeAvBackend.cancel(sessionId);

      const generationError = await Promise.race([
        rejectedGeneration,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Backend segment cancellation timed out.")),
            100,
          ),
        ),
      ]);
      expect(generationError).toBeInstanceOf(NodeAvBackendError);
      expect((generationError as Error).message).toBe(
        "NodeAV HLS operation was cancelled.",
      );
      await Promise.race([
        cancellation,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error("Backend segment cancellation cleanup timed out."),
              ),
            100,
          ),
        ),
      ]);
      expect(activeSegmentGenerationCountForTests(sessionId)).toBe(0);
      expect(
        await temporarySegmentWindowDirectories(artifactDirectory),
      ).toEqual([]);
    } finally {
      await rm(artifactDirectory, { recursive: true, force: true });
    }
  });

  test("aborts linear HLS startup while NodeAV modules are loading", async () => {
    const controller = new AbortController();
    let moduleLoadStarted = false;
    setNodeAvModuleLoaderForTests(
      () =>
        new Promise<never>(() => {
          moduleLoadStarted = true;
        }),
    );

    const startup = nodeAvBackend.startCompatibilityHls({
      sessionId: "linear-module-load-cancel-test",
      mediaFileId: "media-file",
      inputPath: "/tmp/movie.mkv",
      artifactDirectory: "/tmp/lunarr-nodeav-linear-cancel-test",
      segmentSeconds: 4,
      hardwareAcceleration: "off",
      hardwareAccelerationRequired: false,
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(moduleLoadStarted).toBe(true);

    controller.abort();

    await expectRejectsToThrow(startup, "NodeAV HLS operation was cancelled.");
  });

  test("uses configured hardware context and encoder when available", async () => {
    const sessionId = "hardware-linear-test";
    const artifactDirectory = await mkdtemp(
      path.join(tmpdir(), "lunarr-nodeav-hardware-linear-"),
    );
    const hardwareEncoder = { name: "h264_videotoolbox" };
    let disposed = false;
    const hardware = {
      dispose: () => {
        disposed = true;
      },
      getEncoderCodec: (codec: string) =>
        codec === "h264" ? hardwareEncoder : null,
    };
    let decoderHardware: unknown = null;
    let encoderCodec: unknown = null;
    let pipelineStarted!: () => void;
    const pipelineStartedPromise = new Promise<void>((resolve) => {
      pipelineStarted = resolve;
    });
    setNodeAvModuleLoaderForTests(async () => ({
      api: {
        Demuxer: {
          open: async () => ({
            audio: () => null,
            close: async () => undefined,
            video: () => ({}),
          }),
        },
        Decoder: {
          create: async (_stream: unknown, options: { hardware?: unknown }) => {
            decoderHardware = options.hardware;
            return { close: () => undefined };
          },
        },
        Encoder: {
          create: async (codec: unknown) => {
            encoderCodec = codec;
            return { close: () => undefined };
          },
        },
        FilterAPI: {
          create: () => ({ close: () => undefined }),
        },
        HardwareContext: {
          auto: () => null,
          create: () => hardware,
        },
        Muxer: {
          open: async () => ({}),
        },
        pipeline: (
          _demuxer: unknown,
          _stages: unknown,
          _output: unknown,
          options: unknown,
        ) => {
          pipelineStarted();
          const signal = (options as { signal?: AbortSignal }).signal;
          return {
            completion: new Promise<void>((_, reject) => {
              signal?.addEventListener(
                "abort",
                () => reject(new Error("pipeline cancelled")),
                { once: true },
              );
            }),
          };
        },
      } as never,
      constants: {
        AV_LOG_QUIET: 0,
        FF_ENCODER_AAC: "aac",
        FF_ENCODER_LIBX264: "libx264",
        FF_HWDEVICE_TYPE_VIDEOTOOLBOX: "videotoolbox",
      } as never,
      lib: {
        Codec: {
          findEncoderByName: () => ({}),
        },
        Log: {
          setLevel: () => undefined,
        },
      } as never,
    }));

    try {
      const startup = await nodeAvBackend.startCompatibilityHls({
        sessionId,
        mediaFileId: "media-file",
        inputPath: "/tmp/movie.mkv",
        artifactDirectory,
        segmentSeconds: 4,
        hardwareAcceleration: "videotoolbox",
        hardwareAccelerationRequired: true,
      });
      await pipelineStartedPromise;

      expect(decoderHardware).toBe(hardware);
      expect(encoderCodec).toBe(hardwareEncoder);

      await startup.cancel();
      expect(disposed).toBe(true);
    } finally {
      await nodeAvBackend.cancel(sessionId);
      await rm(artifactDirectory, { recursive: true, force: true });
    }
  });

  test("accepts a probeable segment within the requested duration envelope", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 3,
          durationSeconds: 4.2,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 3.8,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
      }),
    ).not.toThrow();
  });

  test("accepts generated segments with expected audio present", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 1,
          comparableVideoTimestampCount: 3,
          durationSeconds: 4.2,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 3.8,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
        expectAudio: true,
      }),
    ).not.toThrow();
  });

  test("accepts generated TS segments with misleading container duration when packet span fits", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 1,
          comparableVideoTimestampCount: 120,
          durationSeconds: 44.823,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 3.622,
          lastVideoTimestampSeconds: 8.382,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
        expectAudio: true,
      }),
    ).not.toThrow();
  });

  test("rejects generated segments without expected audio", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 3,
          durationSeconds: 4.2,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 3.8,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
        expectAudio: true,
      }),
    ).toThrow(NodeAvBackendError);
  });

  test("rejects validation calls without a positive expected duration", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 3,
          durationSeconds: 4,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 3.8,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 0,
      }),
    ).toThrow(NodeAvBackendError);
  });

  test("rejects generated segments without video", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 0,
          durationSeconds: 4,
          firstVideoPacketIsKeyframe: null,
          firstVideoTimestampSeconds: null,
          lastVideoTimestampSeconds: null,
          videoTimestampsMonotonic: true,
          videoStreamCount: 0,
        },
        expectedDurationSeconds: 4,
      }),
    ).toThrow(NodeAvBackendError);
  });

  test("rejects generated segments that are far longer than requested", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 3,
          durationSeconds: 25,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 25,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
      }),
    ).toThrow(NodeAvBackendError);
  });

  test("rejects generated segments with a video timestamp span far beyond the request", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 3,
          durationSeconds: 4,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 10,
          lastVideoTimestampSeconds: 40,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
      }),
    ).toThrow(NodeAvBackendError);
  });

  test("rejects generated segments that are too short for a normal request", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 3,
          durationSeconds: 0.75,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 0.75,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
      }),
    ).toThrow(NodeAvBackendError);
  });

  test("allows short generated segments for short final requests", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 2,
          durationSeconds: 0.75,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 3.8,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 1,
      }),
    ).not.toThrow();
  });

  test("rejects generated segments without video packets", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 0,
          durationSeconds: 4,
          firstVideoPacketIsKeyframe: null,
          firstVideoTimestampSeconds: null,
          lastVideoTimestampSeconds: null,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
      }),
    ).toThrow(NodeAvBackendError);
  });

  test("rejects generated segments that do not start with a video keyframe", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 0,
          durationSeconds: 4,
          firstVideoPacketIsKeyframe: false,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 3.8,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
      }),
    ).toThrow(NodeAvBackendError);
  });

  test("rejects generated segments with non-monotonic comparable video timestamps", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 3,
          durationSeconds: 4,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 0,
          videoTimestampsMonotonic: false,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
      }),
    ).toThrow(NodeAvBackendError);
  });

  test("rejects normal generated segments without enough comparable timestamps", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 1,
          durationSeconds: 4,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 3.8,
          videoTimestampsMonotonic: false,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
      }),
    ).toThrow(NodeAvBackendError);
  });

  test("rejects normal generated segments without comparable timestamp evidence", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 1,
          durationSeconds: null,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 0,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 4,
      }),
    ).toThrow(NodeAvBackendError);
  });

  test("allows short final generated segments without duration when a keyframe is present", () => {
    expect(() =>
      validateGeneratedHlsSegmentProbe({
        probe: {
          audioStreamCount: 0,
          comparableVideoTimestampCount: 1,
          durationSeconds: null,
          firstVideoPacketIsKeyframe: true,
          firstVideoTimestampSeconds: 0,
          lastVideoTimestampSeconds: 0,
          videoTimestampsMonotonic: true,
          videoStreamCount: 1,
        },
        expectedDurationSeconds: 1,
      }),
    ).not.toThrow();
  });
});
