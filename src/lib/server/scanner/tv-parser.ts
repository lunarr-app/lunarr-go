import { guessit } from "guessit-js";
import path from "node:path";

export type ParsedTvEpisode = {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
};

const DIRECTORY_SEASON_TITLE_PATTERN = /^(?:specials|season[\s._-]*\d{1,3})$/i;

function toNumber(value: number | number[] | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const num = Array.isArray(value) ? value[0] : value;
  return Number.isInteger(num) && num >= 0 ? num : null;
}

function toString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string")) return value.join(" ");
  return null;
}

function cleanTitle(value: string) {
  return value
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function showTitleFromPath(filePath: string): string | null {
  const dir = path.dirname(filePath);
  const parts = dir.split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (!DIRECTORY_SEASON_TITLE_PATTERN.test(part)) {
      return cleanTitle(part);
    }
  }
  return null;
}

export function parseTvEpisodePath(filePath: string, _root?: string): ParsedTvEpisode | null {
  const result = guessit(filePath, { type: "episode" });

  const seasonNumber = toNumber(result.season);
  const episodeNumber = toNumber(result.episode);
  if (seasonNumber === null || episodeNumber === null) return null;

  let showTitle = toString(result.title);
  if (!showTitle) return null;

  if (DIRECTORY_SEASON_TITLE_PATTERN.test(showTitle)) {
    const titleFromPath = showTitleFromPath(filePath);
    if (titleFromPath) showTitle = titleFromPath;
  }

  let episodeTitle: string | null = null;
  if (typeof result.episode_title === "string") {
    episodeTitle = result.episode_title;
  } else if (typeof result.alternative_title === "string") {
    if (result.alternative_title.toLowerCase() !== showTitle.toLowerCase()) {
      episodeTitle = result.alternative_title;
    }
  } else if (Array.isArray(result.alternative_title) && result.alternative_title.length > 0) {
    const candidates = result.alternative_title.filter(
      (t) => typeof t === "string" && t.toLowerCase() !== showTitle.toLowerCase(),
    );
    if (candidates.length > 0) {
      episodeTitle = candidates[candidates.length - 1];
    }
  }

  return {
    showTitle,
    seasonNumber,
    episodeNumber,
    episodeTitle,
  };
}
