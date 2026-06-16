import type { TranscodeBackend } from "./backend";
import { ffmpegCliBackend } from "./ffmpeg-cli";

const defaultPlaybackBackend: TranscodeBackend = {
  validateHlsSegmentGenerationPolicy(input) {
    return ffmpegCliBackend.validateHlsSegmentGenerationPolicy?.(input);
  },
  async generateHlsSegmentWindow(input) {
    if (!ffmpegCliBackend.generateHlsSegmentWindow) {
      throw new Error("FFmpeg HLS segment generation is unavailable.");
    }
    return ffmpegCliBackend.generateHlsSegmentWindow(input);
  },
  async cancelJob(sessionId, startSegmentIndex) {
    await ffmpegCliBackend.cancelJob?.(sessionId, startSegmentIndex).catch(() => undefined);
  },
  async cancel(sessionId) {
    await ffmpegCliBackend.cancel(sessionId).catch(() => undefined);
  },
};

let transcodeBackend: TranscodeBackend = defaultPlaybackBackend;

export function getTranscodeBackend() {
  return transcodeBackend;
}

export function setTranscodeBackendInternal(backend: TranscodeBackend) {
  transcodeBackend = backend;
}

export function resetTranscodeBackendInternal() {
  transcodeBackend = defaultPlaybackBackend;
}
