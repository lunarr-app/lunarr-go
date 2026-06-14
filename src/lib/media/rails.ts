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
