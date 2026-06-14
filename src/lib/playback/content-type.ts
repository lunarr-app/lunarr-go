const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
};

export function mediaContentTypeForExtension(extension: string) {
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function playbackContentTypeForMode(input: {
  mode: "direct" | "remux" | "transcode" | "unavailable";
  extension: string;
}) {
  if (input.mode === "remux" || input.mode === "transcode") {
    return "application/vnd.apple.mpegurl";
  }
  return mediaContentTypeForExtension(input.extension);
}
