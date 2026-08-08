import { guessit } from "guessit-js";

export type ParsedTvEpisode = {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
  year: number | null;
};

const SEASON_DIR =
  /^(?:specials|(?:season|staffel|saison|stagione|temporada|seizoen|sezon|sezona|sezóna|séria|säsong|sesong|sæson|kausi|évad|série|musim|сезон|серия|σεζόν|シーズン|시즌)[\s._-]*\d{1,3})$/iu;
const NOISE = new Set(["tv", "hdtv", "hd tv", "television"]);
const SXXEYY = /\bs(\d{1,2})[\s._-]*e(\d{1,3})\b/i;

function num(value: number | number[] | null | undefined): number | null {
  const n = Array.isArray(value) ? value[0] : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

function str(value: string | string[] | null | undefined): string | null {
  if (typeof value === "string") return value;
  return Array.isArray(value) && value.length > 0 ? value.join(" ") : null;
}

function clean(value: string): string {
  return value
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ (?:19|20)\d{2}\s*$/, "")
    .trim();
}

function extractYear(value: string): number | null {
  const parenthetical = value.match(/\((?:19|20)\d{2}\)/);
  if (parenthetical) return Number(parenthetical[0].replace(/\D/g, ""));

  const trailing = value.match(/\b(?:19|20)\d{2}\b\s*$/);
  if (trailing) {
    const before = value.slice(0, trailing.index);
    if (before.trim()) return Number(trailing[0].replace(/\D/g, ""));
  }

  return null;
}

function isNoise(value: string, showTitle: string): boolean {
  const lower = value.toLowerCase();
  return NOISE.has(lower) || clean(value).toLowerCase() === showTitle.toLowerCase();
}

function episodeTitle(
  details: string | string[] | null | undefined,
  alternativeTitle: string | string[] | null | undefined,
  showTitle: string,
): string | null {
  const candidates = [alternativeTitle]
    .flat()
    .filter((t): t is string => typeof t === "string" && !isNoise(t, showTitle));
  const fromAlt = candidates[candidates.length - 1];
  if (fromAlt) return fromAlt;
  if (typeof details === "string" && details) return details;
  if (Array.isArray(details) && details.length > 0) return details[0];
  return null;
}

function pathParts(filePath: string, root?: string): string[] {
  const p = filePath.replaceAll("\\", "/");
  const r = root?.replaceAll("\\", "/").replace(/\/+$/, "");
  const rel = r && (p === r || p.startsWith(`${r}/`)) ? p.slice(r.length) : p;
  return rel.replace(/^\/+/, "").split("/").filter(Boolean);
}

export function parseTvEpisodePath(filePath: string, root?: string): ParsedTvEpisode | null {
  const parts = pathParts(filePath, root);
  if (parts.length === 0) return null;
  const result = guessit(parts.join("/"), { type: "episode" });

  const fallback = parts[parts.length - 1].match(SXXEYY);
  const seasonNumber = num(result.season) ?? (fallback ? Number(fallback[1]) : null);
  const episodeNumber = num(result.episode) ?? (fallback ? Number(fallback[2]) : null);
  if (seasonNumber === null || episodeNumber === null) return null;

  const dirs = parts.slice(0, -1);
  let seasonIdx = dirs.findLastIndex((dir) => SEASON_DIR.test(dir));
  if (seasonIdx === -1) {
    const digitIdx = dirs.findLastIndex((dir) => /\d/.test(dir));
    if (digitIdx > 0 && clean(dirs[digitIdx]) !== clean(str(result.title) ?? "")) {
      seasonIdx = digitIdx;
    }
  }
  const showDir = seasonIdx > 0 ? dirs[seasonIdx - 1] : null;
  const showTitle = clean(showDir === null ? str(result.title) || dirs[dirs.length - 1] || "" : showDir);
  if (!showTitle) return null;

  return {
    showTitle,
    seasonNumber,
    episodeNumber,
    episodeTitle: episodeTitle(result.episode_details, result.alternative_title, showTitle),
    year: showDir ? extractYear(showDir) : null,
  };
}
