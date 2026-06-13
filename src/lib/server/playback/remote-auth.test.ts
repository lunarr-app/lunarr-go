import { describe, expect, test } from "bun:test";
import {
  appendRemotePlaybackToken,
  createRemotePlaybackToken,
  verifyRemotePlaybackToken,
} from "./remote-auth";

describe("remote playback tokens", () => {
  test("verifies a matching HLS token", () => {
    const token = createRemotePlaybackToken({
      route: "hls",
      userId: "user-1",
      mediaFileId: "file-1",
      playbackSessionId: "session-1",
    });

    expect(
      verifyRemotePlaybackToken(token, {
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
    const token = createRemotePlaybackToken({
      route: "direct",
      userId: "user-1",
      mediaFileId: "file-1",
      expiresInSeconds: -1,
    });
    expect(
      verifyRemotePlaybackToken(token, {
        route: "direct",
        mediaFileId: "file-1",
      }),
    ).toBeNull();

    const freshToken = createRemotePlaybackToken({
      route: "direct",
      userId: "user-1",
      mediaFileId: "file-1",
    });
    expect(
      verifyRemotePlaybackToken(freshToken, {
        route: "direct",
        mediaFileId: "file-2",
      }),
    ).toBeNull();
    expect(
      verifyRemotePlaybackToken(`${freshToken}x`, {
        route: "direct",
        mediaFileId: "file-1",
      }),
    ).toBeNull();
  });

  test("appends tokens without dropping existing query params", () => {
    expect(appendRemotePlaybackToken("/media/file", "abc")).toBe(
      "/media/file?remoteToken=abc",
    );
    expect(appendRemotePlaybackToken("/media/file?download=0", "abc")).toBe(
      "/media/file?download=0&remoteToken=abc",
    );
  });
});
