import { filenameParse, removeFileExtension } from "@ctrl/video-filename-parser";
import path from "node:path";

export type ParsedMovieLookup = {
  title: string;
  year: number | null;
};

export type MovieLookupOptions = {
  libraryRoot?: string | null;
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

function parseMovieFilename(basename: string): ParsedMovieLookup {
  const stem = removeFileExtension(path.basename(basename));
  const parsed = filenameParse(stem);
  const parsedTitle = cleanTitle(parsed.title);
  const parsedYear = numericYear(parsed.year);
  const simple = parseTitleYearName(stem);

  if (simple && !parsedTitle) {
    return simple;
  }

  return {
    title: parsedTitle || simple?.title || cleanTitle(stem),
    year: parsedYear ?? simple?.year ?? null,
  };
}

function normalizedLookupPath(value: string | null | undefined) {
  return (value ?? "").replaceAll("\\", "/").replace(/\/+$/, "");
}

export function movieLookupFromPath(
  filePath: string,
  fallback?: ParsedMovieLookup,
  options: MovieLookupOptions = {},
): ParsedMovieLookup {
  const normalizedPath = normalizedLookupPath(filePath);
  const parentPath = normalizedLookupPath(path.posix.dirname(normalizedPath));
  const libraryRoot = normalizedLookupPath(options.libraryRoot);
  if (!libraryRoot || parentPath !== libraryRoot) {
    const parentName = path.posix.basename(parentPath);
    const parent = parseTitleYearName(parentName);
    if (parent) return parent;
  }

  const file = parseMovieFilename(path.posix.basename(normalizedPath));
  return {
    title: file.title || fallback?.title || "",
    year: file.year ?? fallback?.year ?? null,
  };
}
