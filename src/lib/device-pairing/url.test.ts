import { describe, expect, test } from "bun:test";
import { buildLinkDevicePath, buildLinkDeviceUrl, readLinkDevicePrefill } from "./url";

describe("device pairing link URLs", () => {
  test("builds a link-device path with code only", () => {
    expect(buildLinkDevicePath({ userCode: "ABCD-1234" })).toBe("/link-device?code=ABCD-1234");
  });

  test("builds a link-device path with optional name", () => {
    expect(buildLinkDevicePath({ userCode: "ABCD-1234", deviceName: "Living room TV" })).toBe(
      "/link-device?code=ABCD-1234&name=Living+room+TV",
    );
  });

  test("builds an absolute pairing URL from origin", () => {
    expect(buildLinkDeviceUrl("http://localhost:5173", { userCode: "ABCD-1234" })).toBe(
      "http://localhost:5173/link-device?code=ABCD-1234",
    );
  });

  test("reads code and name prefill values from a URL", () => {
    const url = new URL("http://localhost/link-device?code=abcd-1234&name=Living%20room%20TV");

    expect(readLinkDevicePrefill(url)).toEqual({
      initialUserCode: "abcd-1234",
      initialDeviceName: "Living room TV",
    });
  });

  test("trims device names to 80 characters", () => {
    const longName = "x".repeat(90);
    const url = new URL(`http://localhost/link-device?code=ABCD-1234&name=${encodeURIComponent(longName)}`);

    expect(readLinkDevicePrefill(url).initialDeviceName).toHaveLength(80);
  });
});
