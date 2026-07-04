import { describe, expect, test } from "bun:test";
import { formatUserCode, normalizeUserCode } from "./format";

describe("device pairing user code format", () => {
  test("normalizes dashes, spaces, and case", () => {
    expect(normalizeUserCode(" abcd-1234 ")).toBe("ABCD1234");
    expect(normalizeUserCode("abcd 1234")).toBe("ABCD1234");
  });

  test("formats codes longer than four characters with a dash", () => {
    expect(formatUserCode("abcd1234")).toBe("ABCD-1234");
    expect(formatUserCode("ABCD-1234")).toBe("ABCD-1234");
  });

  test("returns short codes without a dash", () => {
    expect(formatUserCode("ab")).toBe("AB");
    expect(formatUserCode("abcd")).toBe("ABCD");
  });
});
