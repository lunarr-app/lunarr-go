import { describe, expect, test } from "bun:test";
import { getMedia } from "theintrodb";

describe("IntroDB API endpoint", () => {
  test("requests GET /v4/media with the lookup identifiers", async () => {
    const requested: URL[] = [];

    const record = await getMedia(
      { tvdbId: 169, durationMs: 7_200_000 },
      {
        fetch: async (input) => {
          requested.push(new URL(input));
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            headers: { get: () => null },
            text: async () => JSON.stringify({ tvdb_id: 169, type: "movie" }),
          };
        },
      },
    );

    expect(record.kind).toBe("media");
    expect(requested).toHaveLength(1);
    expect(requested[0]?.origin).toBe("https://api.theintrodb.org");
    expect(requested[0]?.pathname).toBe("/v4/media");
    expect(requested[0]?.searchParams.get("tvdb_id")).toBe("169");
    expect(requested[0]?.searchParams.get("duration_ms")).toBe("7200000");
  });
});
