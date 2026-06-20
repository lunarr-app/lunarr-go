import { describe, expect, test } from "bun:test";
import { twoRowRailColumnCount, twoRowRailItems, twoRowRailOrder, twoRowRailVisibleCount } from "./rails";

describe("media rails", () => {
  test("keeps small rails on one row", () => {
    const items = ["a", "b", "c"];

    expect(twoRowRailOrder(items, 5)).toBe(items);
  });

  test("orders legacy column-flow rails so visual rows read left to right", () => {
    expect(twoRowRailOrder([1, 2, 3, 4, 5, 6], 5)).toEqual([1, 4, 2, 5, 3, 6]);
    expect(twoRowRailOrder([1, 2, 3, 4, 5], 5)).toEqual([1, 4, 2, 5, 3]);
  });

  test("computes fill-grid column counts from container width", () => {
    expect(twoRowRailColumnCount(0)).toBe(6);
    expect(twoRowRailColumnCount(1200)).toBe(7);
    expect(twoRowRailVisibleCount(1200)).toBe(14);
  });

  test("limits two-row fill grids to two rows worth of items", () => {
    const items = Array.from({ length: 10 }, (_, index) => index + 1);

    expect(twoRowRailItems(items, 1200)).toEqual(items);
    expect(twoRowRailItems(items, 600)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
