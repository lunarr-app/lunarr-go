type DateTimeFallback = "unknown" | "never" | "not-yet";

const dateTimeFallbackLabel: Record<DateTimeFallback, string> = {
  unknown: "Unknown",
  never: "Never",
  "not-yet": "Not yet",
};

export function formatDateTime(
  value: string | null | undefined,
  options: { fallback?: DateTimeFallback } = {},
): string {
  const fallback = dateTimeFallbackLabel[options.fallback ?? "unknown"];
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatRelativeTime(value: string | null | undefined, nowMs = Date.now()): string {
  if (!value) return dateTimeFallbackLabel["not-yet"];
  const seconds = Math.max(0, Math.floor((nowMs - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatMediaDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function formatClockDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatElapsedDuration(
  start: string | null,
  end: string | null,
  options: { running?: boolean; nowMs?: number } = {},
): string {
  if (!start) return "Not started";
  const nowMs = options.nowMs ?? Date.now();
  const endMs = end ? new Date(end).getTime() : options.running ? nowMs : new Date(start).getTime();
  const seconds = Math.max(0, Math.floor((endMs - new Date(start).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatFileSize(bytes: number | string | null | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "Unknown size";
  const gib = value / 1024 / 1024 / 1024;
  if (gib >= 1) return `${gib.toFixed(2)} GB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function formatGibibytes(value: number): string {
  const gib = value / 1024 / 1024 / 1024;
  return `${Number.isInteger(gib) ? gib : gib.toFixed(1)} GiB`;
}

export function formatVoteAverageLabel(voteAverage: number | null | undefined): string | null {
  if (voteAverage === null || voteAverage === undefined) return null;
  return Number(voteAverage).toFixed(1);
}

export function formatVoteCountLabel(voteCount: number | null | undefined): string | null {
  if (voteCount === null || voteCount === undefined) return null;
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(Number(voteCount));
}

type SeasonTabLabelInput = {
  title: string;
  seasonNumber?: number | null;
};

export function seasonTabLabel(season: SeasonTabLabelInput): string {
  if (season.seasonNumber !== null && season.seasonNumber !== undefined) {
    return `Season ${season.seasonNumber}`;
  }
  return season.title;
}

type EpisodeCodeInput = {
  seasonNumber: number | null;
  episodeNumber: number | null;
};

export function formatEpisodeCode(
  episode: EpisodeCodeInput | null | undefined,
  options: { style?: "padded" | "short" } = {},
): string {
  if (!episode) return "";
  const { seasonNumber, episodeNumber } = episode;
  if (seasonNumber === null && episodeNumber === null) return "";
  if (options.style === "short") {
    return `${seasonNumber ?? "?"}x${episodeNumber ?? "?"}`;
  }
  if (seasonNumber === null && episodeNumber === null) return "";
  return `S${seasonNumber === null ? "?" : String(seasonNumber).padStart(2, "0")}E${episodeNumber === null ? "?" : String(episodeNumber).padStart(2, "0")}`;
}
