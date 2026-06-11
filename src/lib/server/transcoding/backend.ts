import type { HardwareAccelerationMode } from "./policy";
import type { TranscodeMode } from "../db/schema/streaming";

export type ProbeInput = {
  mediaFileId: string;
  path: string;
  inputSource?: SeekableTranscodeInputSource;
  signal?: AbortSignal;
};

export type MediaProbeStream = {
  index: number;
  type: "video" | "audio" | "subtitle" | "data";
  codecName: string | null;
  codecLongName: string | null;
  language: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  channels: number | null;
  sampleRate: number | null;
  durationSeconds: number | null;
  bitRate: number | null;
  raw: unknown;
};

export type MediaProbe = {
  container: string | null;
  durationSeconds: number | null;
  bitRate: number | null;
  streams: MediaProbeStream[];
};

export type SeekableTranscodeInputSource = {
  kind: "seekable";
  label: string;
  sizeBytes: number;
  format?: string | null;
  read(start: number, length: number, signal?: AbortSignal): Promise<Buffer>;
  close(): Promise<void>;
};

export type HlsTranscodeInput = {
  sessionId: string;
  mediaFileId: string;
  inputPath: string;
  inputSource?: SeekableTranscodeInputSource;
  artifactDirectory: string;
  segmentSeconds: number;
  mode?: TranscodeMode;
  startTimeSeconds?: number;
  outputTimelineStartSeconds?: number;
  trimStartSeconds?: number;
  hardwareAcceleration: HardwareAccelerationMode;
  hardwareAccelerationRequired: boolean;
  signal?: AbortSignal;
};

export type HlsSegmentWindowEntry = {
  segment: string;
  segmentIndex: number;
  segmentStartSeconds: number;
  segmentSeconds: number;
};

export type HlsSegmentWindowTranscodeInput = HlsTranscodeInput & {
  playlistPath: string;
  segments: HlsSegmentWindowEntry[];
  expectAudio?: boolean;
  segmentGenerationTimeoutMs?: number;
  signal?: AbortSignal;
};

export type HlsSegmentWindowGeneration = {
  completion: Promise<void>;
};

export type HlsSegmentGenerationPolicyInput = Pick<
  HlsTranscodeInput,
  "hardwareAcceleration" | "hardwareAccelerationRequired" | "mode"
>;

export type RunningTranscode = {
  sessionId: string;
  playlistPath: string;
  completion: Promise<void>;
  cancel(): Promise<void>;
};

export type ProbeBackend = {
  probe(input: ProbeInput): Promise<MediaProbe>;
};

export type TranscodeBackend = {
  validateHlsSegmentGenerationPolicy?(
    input: HlsSegmentGenerationPolicyInput,
  ): Promise<void> | void;
  generateHlsSegmentWindow?(
    input: HlsSegmentWindowTranscodeInput,
  ): Promise<HlsSegmentWindowGeneration>;
  cancel(sessionId: string): Promise<void>;
};

export type CompatibilityHlsBackend = {
  // Backend smoke helper for long-running compatibility HLS artifact generation.
  // Normal playback must publish a virtual playlist and call generateHlsSegmentWindow.
  startCompatibilityHls(input: HlsTranscodeInput): Promise<RunningTranscode>;
};
