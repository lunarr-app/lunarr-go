import { guessit } from "guessit-js";
import path from "node:path";

export type ParsedMovieLookup = {
  title: string;
  year: number | null;
};

export type MovieLookupOptions = {
  libraryRoot?: string | null;
};

function numericYear(value: number | string | null | undefined) {
  if (value === undefined || value === null) return null;
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isInteger(num) && num >= 1800 && num <= 3000 ? num : null;
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

const TITLE_NOISE = new Set(["tv", "hdtv", "television"]);

function normalizeTitle(value: string | string[] | null | undefined): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .filter((part): part is string => typeof part === "string" && !TITLE_NOISE.has(part.toLowerCase()))
    .join(" ");
}

function comparableTitle(value: string) {
  return sanitizeLookupTitle(value).toLowerCase();
}

function folderTitleAppearsInFileTitle(folderTitle: string, fileTitle: string) {
  const folderWords = comparableTitle(folderTitle).split(" ").filter(Boolean);
  const fileWords = new Set(comparableTitle(fileTitle).split(" ").filter(Boolean));
  return folderWords.length > 0 && folderWords.every((word) => fileWords.has(word));
}

function parseTitleYearName(value: string): ParsedMovieLookup | null {
  const match = value.match(/^(?<title>.+?)\s*[[(](?<year>\d{4})[\])](?:\s|$)/);
  const title = sanitizeLookupTitle(match?.groups?.title ?? "");
  const year = numericYear(match?.groups?.year);
  return title && year !== null ? { title, year } : null;
}

function parseMovieFilename(basename: string): ParsedMovieLookup {
  const stem = path.basename(basename, path.extname(basename));
  const result = guessit(stem, { type: "movie" });
  const parsedYear = numericYear(result.year);
  const simple = parseTitleYearName(stem);

  const rawTitle = normalizeTitle(result.title);
  const alternativeTitle = Array.isArray(result.alternative_title)
    ? result.alternative_title[result.alternative_title.length - 1]
    : result.alternative_title;
  const parsedTitle =
    typeof alternativeTitle === "string" && alternativeTitle
      ? sanitizeLookupTitle(`${rawTitle} ${alternativeTitle}`)
      : sanitizeLookupTitle(rawTitle);

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
    const fileCandidate = {
      title: file.title || fallback?.title || "",
      year: file.year ?? fallback?.year ?? null,
    };
    const titlesDiffer =
      Boolean(fileCandidate.title) && comparableTitle(fileCandidate.title) !== comparableTitle(folder.title);
    const folderInFileTitle = folderTitleAppearsInFileTitle(folder.title, fileCandidate.title);
    const preferFileFirst = titlesDiffer && !folderInFileTitle;

    if (preferFileFirst) {
      pushCandidate(candidates, seen, fileCandidate);
      pushCandidate(candidates, seen, folder);
      if (file.year !== null && file.year !== folder.year) {
        pushCandidate(candidates, seen, { title: folder.title, year: file.year });
      }
      return candidates;
    }

    pushCandidate(candidates, seen, folder);
    if (file.year !== null && file.year !== folder.year) {
      pushCandidate(candidates, seen, { title: folder.title, year: file.year });
    }
    if (titlesDiffer && !folderInFileTitle) {
      pushCandidate(candidates, seen, fileCandidate);
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
