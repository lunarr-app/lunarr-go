export const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".webm"] as const;
export const SUPPORTED_SIDECAR_SUBTITLE_EXTENSIONS = [".vtt"] as const;

export const VIDEO_EXTENSIONS = new Set<string>(SUPPORTED_VIDEO_EXTENSIONS);
export const SIDECAR_SUBTITLE_EXTENSIONS = new Set<string>(SUPPORTED_SIDECAR_SUBTITLE_EXTENSIONS);

export function isVideoFilePath(filePath: string) {
  return VIDEO_EXTENSIONS.has(filePath.replace(/^.*(?=\.[^.]+$)/, "").toLowerCase());
}

export function isSidecarSubtitlePath(filePath: string) {
  return SIDECAR_SUBTITLE_EXTENSIONS.has(filePath.replace(/^.*(?=\.[^.]+$)/, "").toLowerCase());
}
