import { getDb } from "../db";
import { createId } from "../id";
import type { MediaProbe } from "./backend";

type FileMetadataInput = {
  extension: string;
};

export type ProbedMediaFileValues = {
  duration_seconds: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  container: string | null;
  video_frame_rate: number | null;
  audio_channels: number | null;
  audio_sample_rate: number | null;
  audio_language: string | null;
  audio_bit_rate: number | null;
};

function normalizeContainer(value: string | null, extension: string) {
  const candidates = (value ?? "")
    .split(",")
    .map((candidate) => candidate.trim().toLowerCase())
    .filter(Boolean);

  if (candidates.some((candidate) => candidate === "mp4" || candidate === "mov")) {
    return "mp4";
  }
  if (candidates.includes("matroska")) return "matroska";
  if (candidates.includes("webm")) return "webm";
  if (candidates.length > 0) return candidates[0];

  return extension.replace(/^\./, "").toLowerCase() || null;
}

function positiveNumber(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

function primaryCodec(probe: MediaProbe, type: "video" | "audio") {
  return probe.streams.find((stream) => stream.type === type)?.codecName ?? null;
}

export function mediaFileValuesFromProbe(input: FileMetadataInput, probe: MediaProbe | null): ProbedMediaFileValues {
  if (!probe) {
    return {
      duration_seconds: null,
      video_codec: null,
      audio_codec: null,
      container: normalizeContainer(null, input.extension),
      video_frame_rate: null,
      audio_channels: null,
      audio_sample_rate: null,
      audio_language: null,
      audio_bit_rate: null,
    };
  }

  const videoStream = probe.streams.find((stream) => stream.type === "video");
  const audioStream = probe.streams.find((stream) => stream.type === "audio");

  return {
    duration_seconds: positiveNumber(probe.durationSeconds),
    video_codec: primaryCodec(probe, "video"),
    audio_codec: primaryCodec(probe, "audio"),
    container: normalizeContainer(probe.container, input.extension),
    video_frame_rate: videoStream?.frameRate ?? videoStream?.rFrameRate ?? null,
    audio_channels: audioStream?.channels ?? null,
    audio_sample_rate: audioStream?.sampleRate ?? null,
    audio_language: audioStream?.language ?? null,
    audio_bit_rate: audioStream?.bitRate ?? null,
  };
}

export async function replaceMediaStreamInfo(mediaFileId: string, probe: MediaProbe, now: string) {
  const db = await getDb();
  await db.transaction().execute(async (tx) => {
    await tx.deleteFrom("media_stream_info").where("media_file_id", "=", mediaFileId).execute();

    if (probe.streams.length === 0) return;

    await tx
      .insertInto("media_stream_info")
      .values(
        probe.streams.map((stream) => ({
          id: createId(),
          media_file_id: mediaFileId,
          stream_index: stream.index,
          stream_type: stream.type,
          codec_name: stream.codecName,
          codec_long_name: stream.codecLongName,
          language: stream.language,
          title: stream.title,
          width: stream.width,
          height: stream.height,
          channels: stream.channels,
          sample_rate: stream.sampleRate,
          duration_seconds: stream.durationSeconds,
          bit_rate: stream.bitRate,
          frame_rate: stream.frameRate,
          r_frame_rate: stream.rFrameRate,
          nb_frames: stream.nbFrames,
          raw_json: JSON.stringify(stream.raw ?? null),
          created_at: now,
          updated_at: now,
        })),
      )
      .execute();
  });
}
