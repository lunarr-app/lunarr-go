import path from "node:path";

export const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".webm"] as const;
export const SUPPORTED_SIDECAR_SUBTITLE_EXTENSIONS = [".vtt", ".srt"] as const;

const VIDEO_EXTENSIONS = new Set<string>(SUPPORTED_VIDEO_EXTENSIONS);
const SIDECAR_SUBTITLE_EXTENSIONS = new Set<string>(SUPPORTED_SIDECAR_SUBTITLE_EXTENSIONS);

function fileExtension(filePath: string) {
  return path.extname(filePath).toLowerCase();
}

export function isVideoFilePath(filePath: string) {
  return VIDEO_EXTENSIONS.has(fileExtension(filePath));
}

export function isSidecarSubtitlePath(filePath: string) {
  return SIDECAR_SUBTITLE_EXTENSIONS.has(fileExtension(filePath));
}

export function sidecarSubtitleMimeType(filePath: string) {
  const extension = fileExtension(filePath);
  if (extension === ".srt") return "application/x-subrip";
  return "text/vtt";
}
