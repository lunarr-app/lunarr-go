import { describe, expect, test } from "bun:test";
import { normalizePlaybackSessionMessage } from "./messages";

describe("normalizePlaybackSessionMessage", () => {
  test("presents internal transcode wording as playback session wording", () => {
    expect(normalizePlaybackSessionMessage("Transcode session is no longer active.")).toBe(
      "Playback session is no longer active.",
    );
    expect(normalizePlaybackSessionMessage("transcode session expired.")).toBe("playback session expired.");
    expect(normalizePlaybackSessionMessage("Transcode output is not ready.")).toBe("Playback session is not ready.");
    expect(normalizePlaybackSessionMessage("transcode output disappeared.")).toBe("playback session disappeared.");
    expect(normalizePlaybackSessionMessage("Transcode Output disappeared.")).toBe("Playback session disappeared.");
    expect(normalizePlaybackSessionMessage("Transcode segment generation failed.")).toBe(
      "Playback segment generation failed.",
    );
    expect(normalizePlaybackSessionMessage("TRANSCODE SESSION failed.")).toBe("Playback session failed.");
    expect(normalizePlaybackSessionMessage("Transcode sessions expired.")).toBe("Playback sessions expired.");
    expect(normalizePlaybackSessionMessage("transcode outputs disappeared.")).toBe("playback sessions disappeared.");
    expect(normalizePlaybackSessionMessage("transcode segments disappeared.")).toBe("playback segments disappeared.");
    expect(normalizePlaybackSessionMessage(null)).toBeNull();
    expect(normalizePlaybackSessionMessage(undefined)).toBeNull();
  });
});
