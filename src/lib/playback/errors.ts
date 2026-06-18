export type HlsPlaybackErrorData = {
  type?: string;
  details?: string;
  fatal?: boolean;
  response?: {
    code?: number;
    text?: string;
    url?: string;
  };
  reason?: string;
  error?: Error | { message?: string };
};

const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

const MEDIA_ERROR_LABELS: Record<number, string> = {
  [MEDIA_ERR_ABORTED]: "Playback was aborted.",
  [MEDIA_ERR_NETWORK]: "A network error interrupted playback.",
  [MEDIA_ERR_DECODE]: "The media could not be decoded.",
  [MEDIA_ERR_SRC_NOT_SUPPORTED]: "This media format is not supported.",
};

function sanitizePlaybackMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/https?:\/\/\S+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[stream]";
      }
    })
    .replace(/([?&])(remoteToken|token)=[^&\s]+/gi, "$1$2=[redacted]");
}

function appendMessage(parts: string[], message: string | null | undefined) {
  const sanitized = message ? sanitizePlaybackMessage(message) : null;
  if (sanitized && !parts.includes(sanitized)) parts.push(sanitized);
}

export function formatMediaElementError(video: Pick<HTMLVideoElement, "error">) {
  const mediaError = video.error;
  if (!mediaError) return null;

  const parts: string[] = [];
  const label = MEDIA_ERROR_LABELS[mediaError.code];
  if (label) parts.push(label);
  appendMessage(parts, mediaError.message);

  return parts.join(" ") || "The browser reported a media playback error.";
}

export function formatHlsError(data: HlsPlaybackErrorData) {
  const parts: string[] = [];
  if (data.type) parts.push(`HLS ${data.type} error`);
  if (data.details) parts.push(data.details.replaceAll("_", " "));
  if (typeof data.response?.code === "number") parts.push(`HTTP ${data.response.code}`);
  appendMessage(parts, data.response?.text);
  appendMessage(parts, data.reason);
  appendMessage(parts, data.error instanceof Error ? data.error.message : data.error?.message);

  return parts.join(" · ") || "HLS playback failed.";
}
