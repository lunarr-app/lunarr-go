export function normalizePlaybackSessionMessage(message: string | null | undefined) {
  return (
    message?.replace(
      /\btranscode\s+(session|sessions|output|outputs|segment|segments)\b/gi,
      (match, noun: string) => {
        const normalizedNoun = noun.toLowerCase();
        const replacement =
          normalizedNoun === "segment" || normalizedNoun === "segments"
            ? normalizedNoun
            : normalizedNoun.endsWith("s")
              ? "sessions"
              : "session";
        return /^[A-Z]/.test(match)
          ? `Playback ${replacement}`
          : `playback ${replacement}`;
      },
    ) ?? null
  );
}
