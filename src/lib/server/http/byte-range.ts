export type ByteRange = {
  start: number;
  end: number;
};

export function parseByteRange(rangeHeader: string | null | undefined, size: number): ByteRange | null {
  if (!rangeHeader || size <= 0) return null;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const startText = match[1];
  const endText = match[2];
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;

  return {
    start,
    end: Math.min(end, size - 1),
  };
}
