import { describe, expect, test } from "bun:test";
import {
  appendCastToken,
  createCastPlaybackToken,
  verifyCastPlaybackToken,
} from "./cast";

describe("cast playback tokens", () => {
  test("verifies a matching HLS token", () => {
    const token = createCastPlaybackToken({
      route: "hls",
      userId: "user-1",
      mediaFileId: "file-1",
      playbackSessionId: "session-1",
    });

    expect(
      verifyCastPlaybackToken(token, {
        route: "hls",
        playbackSessionId: "session-1",
      }),
    ).toMatchObject({
      route: "hls",
      userId: "user-1",
      mediaFileId: "file-1",
      playbackSessionId: "session-1",
    });
  });

  test("rejects mismatched, expired, and tampered tokens", () => {
    const token = createCastPlaybackToken({
      route: "direct",
      userId: "user-1",
      mediaFileId: "file-1",
      expiresInSeconds: -1,
    });
    expect(
      verifyCastPlaybackToken(token, {
        route: "direct",
        mediaFileId: "file-1",
      }),
    ).toBeNull();

    const freshToken = createCastPlaybackToken({
      route: "direct",
      userId: "user-1",
      mediaFileId: "file-1",
    });
    expect(
      verifyCastPlaybackToken(freshToken, {
        route: "direct",
        mediaFileId: "file-2",
      }),
    ).toBeNull();
    expect(
      verifyCastPlaybackToken(`${freshToken}x`, {
        route: "direct",
        mediaFileId: "file-1",
      }),
    ).toBeNull();
  });

  test("appends tokens without dropping existing query params", () => {
    expect(appendCastToken("/media/file", "abc")).toBe(
      "/media/file?castToken=abc",
    );
    expect(appendCastToken("/media/file?download=0", "abc")).toBe(
      "/media/file?download=0&castToken=abc",
    );
  });
});
