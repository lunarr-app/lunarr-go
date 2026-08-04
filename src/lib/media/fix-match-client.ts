import type { FixMatchCandidate } from "$lib/media/types";

export type FixMatchSearchResult = {
  candidates: FixMatchCandidate[];
  resolved: boolean;
};

async function readJsonError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  throw new Error(body?.detail ?? fallback);
}

function matchApiBase(kind: "movie" | "show", mediaItemId: string) {
  return `/api/${kind === "movie" ? "movies" : "shows"}/${encodeURIComponent(mediaItemId)}/match`;
}

export async function searchFixMatchCandidates(
  kind: "movie" | "show",
  mediaItemId: string,
  query: string,
): Promise<FixMatchSearchResult> {
  const response = await fetch(`${matchApiBase(kind, mediaItemId)}/search?query=${encodeURIComponent(query)}`);
  if (!response.ok) {
    await readJsonError(response, "Could not search TMDb.");
  }
  return (await response.json()) as FixMatchSearchResult;
}

export async function applyFixMatch(kind: "movie" | "show", mediaItemId: string, tmdbId: number) {
  const response = await fetch(matchApiBase(kind, mediaItemId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tmdbId }),
  });
  if (!response.ok) {
    await readJsonError(response, "Could not update the match.");
  }
  return (await response.json()) as { mediaItemId: string };
}
