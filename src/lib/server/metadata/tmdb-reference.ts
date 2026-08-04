export type TmdbReference = {
  /** Null when the reference is a bare numeric ID whose media kind cannot be inferred. */
  kind: "movie" | "tv" | null;
  tmdbId: number;
};

const TMDB_HOST_PATTERN = /^(?:www\.)?themoviedb\.org$/i;

export function parseTmdbReference(input: string): TmdbReference | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d{1,10}$/.test(trimmed)) {
    return { kind: null, tmdbId: Number(trimmed) };
  }

  let url: URL | null = null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
  } else if (TMDB_HOST_PATTERN.test(trimmed.split("/")[0] ?? "")) {
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
  if (!url || !TMDB_HOST_PATTERN.test(url.hostname)) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment !== "movie" && segment !== "tv") continue;
    const idSegment = segments[index + 1];
    if (!idSegment) return null;
    const idMatch = idSegment.match(/^(\d+)/);
    if (!idMatch) return null;
    return { kind: segment === "movie" ? "movie" : "tv", tmdbId: Number(idMatch[1]) };
  }

  return null;
}
