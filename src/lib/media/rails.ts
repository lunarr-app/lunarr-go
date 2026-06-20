const DEFAULT_GAP_PX = 17.6;

export function twoRowRailColumnCount(containerWidth: number, options: { minColumnPx?: number; gapPx?: number } = {}) {
  const minColumnPx = options.minColumnPx ?? 152;
  const gapPx = options.gapPx ?? DEFAULT_GAP_PX;
  if (containerWidth <= 0) return 6;
  return Math.max(1, Math.floor((containerWidth + gapPx) / (minColumnPx + gapPx)));
}

export function twoRowRailVisibleCount(
  containerWidth: number,
  options: { minColumnPx?: number; gapPx?: number; rows?: number } = {},
) {
  const rows = options.rows ?? 2;
  return twoRowRailColumnCount(containerWidth, options) * rows;
}

export function twoRowRailItems<T>(
  items: readonly T[],
  containerWidth: number,
  options: { minColumnPx?: number; gapPx?: number; rows?: number } = {},
) {
  return items.slice(0, twoRowRailVisibleCount(containerWidth, options));
}

/** @deprecated Use twoRowRailItems with a width-filling row grid instead. */
export function twoRowRailOrder<T>(items: readonly T[], minimumCount: number) {
  if (items.length < minimumCount) return items;

  const rowLength = Math.ceil(items.length / 2);
  const ordered: T[] = [];
  for (let index = 0; index < rowLength; index += 1) {
    ordered.push(items[index]);
    const secondRowIndex = index + rowLength;
    if (secondRowIndex < items.length) ordered.push(items[secondRowIndex]);
  }
  return ordered;
}
