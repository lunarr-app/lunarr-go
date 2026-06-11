import { filenameParse, removeFileExtension } from "@ctrl/video-filename-parser";
import path from "node:path";

export type ParsedMovieLookup = {
  title: string;
  year: number | null;
};

function numericYear(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1800 && parsed <= 3000
    ? parsed
    : null;
}

function cleanTitle(value: string) {
  return value
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTitleYearName(value: string): ParsedMovieLookup | null {
  const match = value.match(/^(?<title>.+?)\s*[[(](?<year>\d{4})[\])](?:\s|$)/);
  const title = cleanTitle(match?.groups?.title ?? "");
  const year = numericYear(match?.groups?.year);
  return title && year !== null ? { title, year } : null;
}

function normalizeTitle(value: string) {
  return cleanTitle(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseMovieFilename(basename: string): ParsedMovieLookup {
  const stem = removeFileExtension(path.basename(basename));
  const parsed = filenameParse(stem);
  const parsedTitle = cleanTitle(parsed.title);
  const parsedYear = numericYear(parsed.year);
  const simple = parseTitleYearName(stem);

  if (
    simple &&
    (!parsedTitle ||
      normalizeTitle(simple.title).endsWith(normalizeTitle(parsedTitle)) &&
        simple.title.length > parsedTitle.length + 2)
  ) {
    return simple;
  }

  return {
    title: parsedTitle || simple?.title || cleanTitle(stem),
    year: parsedYear ?? simple?.year ?? null,
  };
}

export function movieLookupFromPath(
  filePath: string,
  fallback?: ParsedMovieLookup,
): ParsedMovieLookup {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const parentName = path.posix.basename(path.posix.dirname(normalizedPath));
  const parent = parseTitleYearName(parentName);
  if (parent) return parent;

  const file = parseMovieFilename(path.posix.basename(normalizedPath));
  return {
    title: file.title || fallback?.title || "",
    year: file.year ?? fallback?.year ?? null,
  };
}
