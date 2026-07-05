import { describe, expect, test } from "bun:test";
import { formatDevicePairingApiKeyExpiryLabel } from "./expiry-label";

describe("formatDevicePairingApiKeyExpiryLabel", () => {
  test("formats whole-year durations", () => {
    expect(formatDevicePairingApiKeyExpiryLabel(365)).toBe("1 year");
    expect(formatDevicePairingApiKeyExpiryLabel(730)).toBe("2 years");
  });

  test("formats day-based durations", () => {
    expect(formatDevicePairingApiKeyExpiryLabel(1)).toBe("1 day");
    expect(formatDevicePairingApiKeyExpiryLabel(90)).toBe("90 days");
  });
});
