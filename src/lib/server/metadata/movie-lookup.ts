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
  return Number.isInteger(parsed) && parsed >= 1800 && parsed <= 3000 ? parsed : null;
}

function sanitizeLookupTitle(value: string) {
  return value
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/^["']+|["']+$/g, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableTitle(value: string) {
  return sanitizeLookupTitle(value).toLowerCase();
}

function parseTitleYearName(value: string): ParsedMovieLookup | null {
  const match = value.match(/^(?<title>.+?)\s*[[(](?<year>\d{4})[\])](?:\s|$)/);
  const title = sanitizeLookupTitle(match?.groups?.title ?? "");
  const year = numericYear(match?.groups?.year);
  return title && year !== null ? { title, year } : null;
}

function parseMovieFilename(basename: string): ParsedMovieLookup {
  const stem = removeFileExtension(path.basename(basename));
  const parsed = filenameParse(stem);
  const parsedTitle = sanitizeLookupTitle(parsed.title);
  const parsedYear = numericYear(parsed.year);
  const simple = parseTitleYearName(stem);

  if (simple && !parsedTitle) {
    return simple;
  }

  return {
    title: parsedTitle || simple?.title || sanitizeLookupTitle(stem),
    year: parsedYear ?? simple?.year ?? null,
  };
}

function normalizedLookupPath(value: string | null | undefined) {
  return (value ?? "").replaceAll("\\", "/").replace(/\/+$/, "");
}

function candidateKey(candidate: ParsedMovieLookup) {
  return `${candidate.title.toLowerCase()}\0${candidate.year ?? ""}`;
}

function pushCandidate(candidates: ParsedMovieLookup[], seen: Set<string>, candidate: ParsedMovieLookup) {
  if (!candidate.title) return;
  const key = candidateKey(candidate);
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(candidate);
}

export function movieLookupCandidates(
  filePath: string,
  fallback?: ParsedMovieLookup,
  options: MovieLookupOptions = {},
): ParsedMovieLookup[] {
  const normalizedPath = normalizedLookupPath(filePath);
  const basename = path.posix.basename(normalizedPath);
  const file = parseMovieFilename(basename);
  const parentPath = normalizedLookupPath(path.posix.dirname(normalizedPath));
  const libraryRoot = normalizedLookupPath(options.libraryRoot);
  const folder =
    !libraryRoot || parentPath !== libraryRoot ? parseTitleYearName(path.posix.basename(parentPath)) : null;

  const candidates: ParsedMovieLookup[] = [];
  const seen = new Set<string>();

  if (folder) {
    pushCandidate(candidates, seen, folder);
    if (file.year !== null && file.year !== folder.year) {
      pushCandidate(candidates, seen, { title: folder.title, year: file.year });
    }
    if (file.title && comparableTitle(file.title) !== comparableTitle(folder.title)) {
      pushCandidate(candidates, seen, file);
    }
    return candidates;
  }

  pushCandidate(candidates, seen, {
    title: file.title || fallback?.title || "",
    year: file.year ?? fallback?.year ?? null,
  });
  return candidates;
}

export function movieLookupFromPath(
  filePath: string,
  fallback?: ParsedMovieLookup,
  options: MovieLookupOptions = {},
): ParsedMovieLookup {
  const candidates = movieLookupCandidates(filePath, fallback, options);
  return candidates[0] ?? { title: fallback?.title ?? "", year: fallback?.year ?? null };
}
