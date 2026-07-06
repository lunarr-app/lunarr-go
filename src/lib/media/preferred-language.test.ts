import { describe, expect, test } from "bun:test";
import { normalizePreferredLanguage } from "./preferred-language";

describe("preferred language normalization", () => {
  test("trims, lowercases, and caps length", () => {
    expect(normalizePreferredLanguage(" ENG ")).toBe("eng");
    expect(normalizePreferredLanguage(" JPN ")).toBe("jpn");
    expect(normalizePreferredLanguage("a".repeat(40))).toBe("a".repeat(32));
  });

  test("returns null for empty values", () => {
    expect(normalizePreferredLanguage("")).toBe(null);
    expect(normalizePreferredLanguage("   ")).toBe(null);
    expect(normalizePreferredLanguage(null)).toBe(null);
    expect(normalizePreferredLanguage(undefined)).toBe(null);
  });
});
