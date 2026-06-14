import { describe, expect, test } from "bun:test";
import { getErrorMessage, getErrorTitle, shouldShowRetry } from "./page-copy";

describe("error page copy", () => {
  test("uses status-specific titles", () => {
    expect(getErrorTitle(404)).toBe("Page not found");
    expect(getErrorTitle(401)).toBe("Sign in required");
    expect(getErrorTitle(403)).toBe("Access denied");
    expect(getErrorTitle(500)).toBe("Server error");
    expect(getErrorTitle(418)).toBe("Something went wrong");
  });

  test("prefers server error messages for client errors", () => {
    expect(getErrorMessage(404, "Movie not found")).toBe("Movie not found");
    expect(getErrorMessage(403, "Admin access required")).toBe("Admin access required");
    expect(getErrorMessage(401, "Unauthorized")).toBe("Unauthorized");
  });

  test("falls back to generic copy when no server message is provided", () => {
    expect(getErrorMessage(404)).toBe("That page does not exist or may have moved.");
    expect(getErrorMessage(403)).toBe("Your account does not have access to this page.");
    expect(getErrorMessage(500)).toBe("Lunarr could not finish loading this page.");
  });

  test("hides retry for missing pages", () => {
    expect(shouldShowRetry(404)).toBe(false);
    expect(shouldShowRetry(500)).toBe(true);
    expect(shouldShowRetry(403)).toBe(true);
  });
});
