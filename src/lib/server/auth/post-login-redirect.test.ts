import { describe, expect, test } from "bun:test";
import { loginPathWithRedirect, sanitizePostLoginRedirect } from "./post-login-redirect";

describe("post-login redirect", () => {
  test("accepts same-origin relative paths", () => {
    expect(sanitizePostLoginRedirect("/link-device?code=ABCD-1234&name=TV")).toBe(
      "/link-device?code=ABCD-1234&name=TV",
    );
  });

  test("rejects external and protocol-relative URLs", () => {
    expect(sanitizePostLoginRedirect("https://evil.test/link-device")).toBeNull();
    expect(sanitizePostLoginRedirect("//evil.test/link-device")).toBeNull();
    expect(sanitizePostLoginRedirect("/\\evil.test")).toBe("/\\evil.test");
  });

  test("rejects login redirect loops", () => {
    expect(sanitizePostLoginRedirect("/login")).toBeNull();
    expect(sanitizePostLoginRedirect("/login?redirectTo=%2Fmovies")).toBeNull();
  });

  test("builds a login path with encoded redirect target", () => {
    expect(loginPathWithRedirect("/link-device?code=ABCD-1234")).toBe(
      "/login?redirectTo=%2Flink-device%3Fcode%3DABCD-1234",
    );
  });
});
