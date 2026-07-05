import { describe, expect, test } from "bun:test";
import { devicePairingApiKeyExpiresInSeconds, devicePairingApiKeyExpirySettings } from "./env";

describe("device pairing API key env resolution", () => {
  test("treats zero days as never expiring", () => {
    expect(devicePairingApiKeyExpiresInSeconds(0)).toBeUndefined();
    expect(devicePairingApiKeyExpirySettings(0)).toEqual({
      neverExpires: true,
      label: "",
    });
  });

  test("converts day counts to seconds and labels", () => {
    expect(devicePairingApiKeyExpiresInSeconds(730)).toBe(730 * 24 * 60 * 60);
    expect(devicePairingApiKeyExpirySettings(730)).toEqual({
      neverExpires: false,
      label: "2 years",
    });
  });
});
