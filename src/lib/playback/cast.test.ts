import { describe, expect, test } from "bun:test";
import { connectedCastSession } from "./cast";

describe("Cast playback helpers", () => {
  test("accepts only sessions that can load receiver media", () => {
    expect(connectedCastSession(null)).toBeNull();
    expect(connectedCastSession({})).toBeNull();

    const session = {
      loadMedia: async () => ({}),
    };

    expect(connectedCastSession(session)).toBe(session);
  });
});
