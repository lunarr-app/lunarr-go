import { describe, expect, test } from "bun:test";
import { resolveDevicePairingApiKeyExpiresInSeconds, resolveDevicePairingApiKeyExpirySettings } from "./env";

describe("device pairing API key env resolution", () => {
  test("treats zero days as never expiring", () => {
    expect(resolveDevicePairingApiKeyExpiresInSeconds(0)).toBeUndefined();
    expect(resolveDevicePairingApiKeyExpirySettings(0)).toEqual({
      neverExpires: true,
      label: "",
    });
  });

  test("converts day counts to seconds and labels", () => {
    expect(resolveDevicePairingApiKeyExpiresInSeconds(730)).toBe(730 * 24 * 60 * 60);
    expect(resolveDevicePairingApiKeyExpirySettings(730)).toEqual({
      neverExpires: false,
      label: "2 years",
    });
  });
});
