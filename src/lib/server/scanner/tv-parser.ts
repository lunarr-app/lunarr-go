import { guessit } from "guessit-js";
import path from "node:path";

export type ParsedTvEpisode = {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
};

const DIRECTORY_SEASON_TITLE_PATTERN = /^(?:specials|season[\s._-]*\d{1,3})$/i;
const ALTERNATIVE_TITLE_NOISE = new Set(["tv", "hdtv", "hd tv", "television"]);

function toNumber(value: number | number[] | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const num = Array.isArray(value) ? value[0] : value;
  return Number.isInteger(num) && num >= 0 ? num : null;
}

function toString(value: string | string[] | undefined | null): string | null {
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

function isNoiseTitle(value: string, showTitle: string): boolean {
  const lower = value.toLowerCase();
  return lower === showTitle.toLowerCase() || ALTERNATIVE_TITLE_NOISE.has(lower);
}

function extractEpisodeTitle(
  episodeDetails: string | string[] | undefined | null,
  alternativeTitle: string | string[] | undefined | null,
  showTitle: string,
): string | null {
  if (typeof episodeDetails === "string" && episodeDetails.length > 0) {
    return episodeDetails;
  }
  if (Array.isArray(episodeDetails) && episodeDetails.length > 0) {
    return episodeDetails[0];
  }
  if (typeof alternativeTitle === "string" && !isNoiseTitle(alternativeTitle, showTitle)) {
    return alternativeTitle;
  }
  if (Array.isArray(alternativeTitle) && alternativeTitle.length > 0) {
    const candidates = alternativeTitle.filter(
      (t): t is string => typeof t === "string" && !isNoiseTitle(t, showTitle),
    );
    if (candidates.length > 0) {
      return candidates[candidates.length - 1];
    }
  }
  return null;
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

  const episodeTitle = extractEpisodeTitle(result.episode_details, result.alternative_title, showTitle);

  return {
    showTitle,
    seasonNumber,
    episodeNumber,
    episodeTitle,
  };
}
