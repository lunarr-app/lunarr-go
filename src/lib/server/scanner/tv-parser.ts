import { removeFileExtension } from "@ctrl/video-filename-parser";
import path from "node:path";

export type ParsedTvEpisode = {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
};

const SEASON_EPISODE_PATTERN = /(?:^|[\s._-])s(?<season>\d{1,3})[\s._-]*e(?<episode>\d{1,4})(?:\b|[\s._-])/i;
const SEASON_X_EPISODE_PATTERN = /(?:^|[\s._-])(?<season>\d{1,3})x(?<episode>\d{1,4})(?:\b|[\s._-])/i;
const LEADING_EPISODE_PATTERN = /^(?<episode>\d{1,4})(?:\s*[-._]\s*|\s+)(?<title>.+)?$/;
const SEASON_DIRECTORY_PATTERN = /^season[\s._-]*(?<season>\d{1,3})$/i;
const SPECIALS_DIRECTORY_PATTERN = /^(specials|season[\s._-]*0+)$/i;

function cleanTitle(value: string) {
  return value
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripEpisodeTail(value: string) {
  return cleanTitle(value.replace(/^[\s._-]+/, "").replace(/[\s._-]+$/, ""));
}

function positiveInt(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function pathParts(filePath: string, root?: string) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const normalizedRoot = root?.replaceAll("\\", "/").replace(/\/+$/, "");
  const relative =
    normalizedRoot && (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`))
      ? normalizedPath.slice(normalizedRoot.length).replace(/^\/+/, "")
      : normalizedPath.replace(/^\/+/, "");
  return relative.split("/").filter(Boolean);
}

function seasonFromDirectory(directoryName: string) {
  if (SPECIALS_DIRECTORY_PATTERN.test(directoryName)) return 0;
  const match = directoryName.match(SEASON_DIRECTORY_PATTERN);
  return positiveInt(match?.groups?.season);
}

function titleFromContext(parts: string[], seasonDirectoryIndex: number | null) {
  if (seasonDirectoryIndex !== null && seasonDirectoryIndex > 0) {
    return cleanTitle(parts[seasonDirectoryIndex - 1]);
  }
  if (parts.length > 1) return cleanTitle(parts[parts.length - 2]);
  return "";
}

function parseByPattern(fileStem: string, parts: string[], pattern: RegExp): ParsedTvEpisode | null {
  const match = fileStem.match(pattern);
  const seasonNumber = positiveInt(match?.groups?.season);
  const episodeNumber = positiveInt(match?.groups?.episode);
  if (!match || seasonNumber === null || episodeNumber === null) return null;

  const prefix = fileStem.slice(0, match.index).trim();
  const suffix = fileStem.slice((match.index ?? 0) + match[0].length);
  const directoryParts = parts.slice(0, -1);
  const seasonDirectoryIndex = directoryParts.findLastIndex((part) => seasonFromDirectory(part) !== null);
  const contextTitle = titleFromContext(parts, seasonDirectoryIndex === -1 ? null : seasonDirectoryIndex);
  const showTitle =
    seasonDirectoryIndex === -1 ? cleanTitle(prefix) || contextTitle : contextTitle || cleanTitle(prefix);
  if (!showTitle) return null;

  return {
    showTitle,
    seasonNumber,
    episodeNumber,
    episodeTitle: stripEpisodeTail(suffix) || null,
  };
}

export function parseTvEpisodePath(filePath: string, root?: string): ParsedTvEpisode | null {
  const parts = pathParts(filePath, root);
  const basename = parts.at(-1);
  if (!basename) return null;

  const fileStem = removeFileExtension(path.posix.basename(basename));
  const patternMatch =
    parseByPattern(fileStem, parts, SEASON_EPISODE_PATTERN) ??
    parseByPattern(fileStem, parts, SEASON_X_EPISODE_PATTERN);
  if (patternMatch) return patternMatch;

  const directoryParts = parts.slice(0, -1);
  const seasonDirectoryIndex = directoryParts.findLastIndex((part) => seasonFromDirectory(part) !== null);
  if (seasonDirectoryIndex === -1) return null;

  const seasonNumber = seasonFromDirectory(directoryParts[seasonDirectoryIndex]);
  const leadingEpisode = fileStem.match(LEADING_EPISODE_PATTERN);
  const episodeNumber = positiveInt(leadingEpisode?.groups?.episode);
  const showTitle = titleFromContext(parts, seasonDirectoryIndex);
  if (seasonNumber === null || episodeNumber === null || !showTitle) return null;

  return {
    showTitle,
    seasonNumber,
    episodeNumber,
    episodeTitle: stripEpisodeTail(leadingEpisode?.groups?.title ?? "") || null,
  };
}
