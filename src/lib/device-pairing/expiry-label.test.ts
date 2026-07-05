import { describe, expect, test } from "bun:test";
import { formatDevicePairingApiKeyExpiryLabel } from "./expiry-label";
import {
  resolveDevicePairingApiKeyExpiresInSeconds,
  resolveDevicePairingApiKeyExpiryLabel,
} from "$lib/server/device-pairing/env";

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

describe("device pairing API key env resolution", () => {
  test("treats zero days as never expiring", () => {
    expect(resolveDevicePairingApiKeyExpiresInSeconds(0)).toBeUndefined();
    expect(resolveDevicePairingApiKeyExpiryLabel(0)).toBe("never");
  });

  test("converts day counts to seconds and labels", () => {
    expect(resolveDevicePairingApiKeyExpiresInSeconds(730)).toBe(730 * 24 * 60 * 60);
    expect(resolveDevicePairingApiKeyExpiryLabel(730)).toBe("2 years");
  });
});
