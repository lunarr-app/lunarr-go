import { describe, expect, test } from "bun:test";
import { formatHlsError, formatMediaElementError } from "./errors";

describe("playback errors", () => {
  test("formats media element error codes", () => {
    expect(
      formatMediaElementError({
        error: {
          code: 2,
          message: "Failed to load resource",
        } as MediaError,
      }),
    ).toBe("A network error interrupted playback. Failed to load resource");
  });

  test("redacts tokens from media error messages", () => {
    expect(
      formatMediaElementError({
        error: {
          code: 4,
          message: "https://lunarr.example/media/files/abc/stream?remoteToken=secret",
        } as MediaError,
      }),
    ).toBe("This media format is not supported. https://lunarr.example/media/files/abc/stream");
  });

  test("formats fatal HLS errors with HTTP status", () => {
    expect(
      formatHlsError({
        type: "networkError",
        details: "fragLoadError",
        fatal: true,
        response: { code: 404, text: "Not Found" },
      }),
    ).toBe("HLS networkError error · fragLoadError · HTTP 404 · Not Found");
  });
});
