import { describe, expect, test } from "bun:test";
import { twoRowRailOrder } from "./rails";

describe("media rails", () => {
  test("keeps small rails on one row", () => {
    const items = ["a", "b", "c"];

    expect(twoRowRailOrder(items, 5)).toBe(items);
  });

  test("orders two-row rails so visual rows read left to right", () => {
    expect(twoRowRailOrder([1, 2, 3, 4, 5, 6], 5)).toEqual([1, 4, 2, 5, 3, 6]);
    expect(twoRowRailOrder([1, 2, 3, 4, 5], 5)).toEqual([1, 4, 2, 5, 3]);
  });
});
