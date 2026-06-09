import { expect } from "bun:test";

export async function expectRejectsToThrow(
  promise: unknown,
  expected?: string | RegExp,
) {
  try {
    await promise;
  } catch (error) {
    if (expected === undefined) return;
    expect(() => {
      throw error;
    }).toThrow(expected);
    return;
  }

  throw new Error("Expected promise to reject.");
}

export async function expectRejectsToMatchObject(
  promise: unknown,
  expected: object,
) {
  try {
    await promise;
  } catch (error) {
    expect(error).toMatchObject(expected);
    return;
  }

  throw new Error("Expected promise to reject.");
}
