import { describe, expect, test } from "bun:test";
import {
  appendSignedPlaybackToken,
  createSignedPlaybackToken,
  verifySignedPlaybackToken,
  withSignedPlaybackHeaders,
} from "./signed-token";

describe("signed playback tokens", () => {
  test("verifies a matching HLS token", () => {
    const token = createSignedPlaybackToken({
      route: "hls",
      userId: "user-1",
      mediaFileId: "file-1",
      playbackSessionId: "session-1",
    });

    expect(
      verifySignedPlaybackToken(token, {
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
    const token = createSignedPlaybackToken({
      route: "direct",
      userId: "user-1",
      mediaFileId: "file-1",
      expiresInSeconds: -1,
    });
    expect(
      verifySignedPlaybackToken(token, {
        route: "direct",
        mediaFileId: "file-1",
      }),
    ).toBeNull();

    const freshToken = createSignedPlaybackToken({
      route: "direct",
      userId: "user-1",
      mediaFileId: "file-1",
    });
    expect(
      verifySignedPlaybackToken(freshToken, {
        route: "direct",
        mediaFileId: "file-2",
      }),
    ).toBeNull();
    expect(
      verifySignedPlaybackToken(`${freshToken}x`, {
        route: "direct",
        mediaFileId: "file-1",
      }),
    ).toBeNull();
  });

  test("appends tokens without dropping existing query params", () => {
    expect(appendSignedPlaybackToken("/media/file", "abc")).toBe(
      "/media/file?remoteToken=abc",
    );
    expect(appendSignedPlaybackToken("/media/file?download=0", "abc")).toBe(
      "/media/file?download=0&remoteToken=abc",
    );
  });

  test("adds receiver headers and disables caching only for signed playback", () => {
    const unsigned = withSignedPlaybackHeaders(new Response("body"), false);
    expect(unsigned.headers.get("cache-control")).toBeNull();

    const signed = withSignedPlaybackHeaders(new Response("body"), true);
    expect(signed.headers.get("cache-control")).toBe("no-store");
    expect(signed.headers.get("access-control-allow-origin")).toBe("*");
  });
});
