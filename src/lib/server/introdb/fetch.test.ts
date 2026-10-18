import { afterEach, describe, expect, mock, test } from "bun:test";
import { fetchIntroDbMedia } from "./index";
import type { MediaRecord, MediaResponse } from "theintrodb";

const sampleRecord: MediaRecord = {
  kind: "media",
  tvdbId: 169,
  type: "movie",
  groupDurationMs: null,
  intro: [{ startMs: 0, endMs: 90_000, durationMs: 90_000, startsAtBeginning: true, endsAtMediaEnd: false }],
  recap: [],
  credits: [],
  preview: [],
};

const getMedia = mock(async (): Promise<MediaResponse> => sampleRecord);

mock.module("theintrodb", () => ({
  getMedia,
}));

afterEach(() => {
  getMedia.mockClear();
});

describe("fetchIntroDbMedia", () => {
  test("reuses cached IntroDB responses for the same lookup", async () => {
    const lookup = { tmdbId: 603 };

    expect(await fetchIntroDbMedia(lookup, 7200)).toEqual(sampleRecord);
    expect(await fetchIntroDbMedia(lookup, 7200)).toEqual(sampleRecord);

    expect(getMedia).toHaveBeenCalledTimes(1);
  });

  test("does not cache failed IntroDB requests", async () => {
    getMedia.mockImplementationOnce(async () => {
      throw new Error("IntroDB unavailable");
    });

    expect(await fetchIntroDbMedia({ tmdbId: 603 })).toBeNull();
    expect(await fetchIntroDbMedia({ tmdbId: 603 })).toEqual(sampleRecord);

    expect(getMedia).toHaveBeenCalledTimes(2);
  });

  test("ignores non-media response shapes", async () => {
    getMedia.mockImplementationOnce(async () => ({
      kind: "episodes",
      tvdbId: 71663,
      type: "tv",
      episodes: [],
    }));

    expect(await fetchIntroDbMedia({ tvdbId: 71663 })).toBeNull();

    expect(getMedia).toHaveBeenCalledTimes(1);
  });

  test("caches lookups separately per identity and duration hint", async () => {
    expect(await fetchIntroDbMedia({ tvdbId: 169 }, 7200)).toEqual(sampleRecord);
    expect(await fetchIntroDbMedia({ tvdbId: 169 }, 7300)).toEqual(sampleRecord);
    expect(await fetchIntroDbMedia({ tmdbId: 169 }, 7200)).toEqual(sampleRecord);

    expect(getMedia).toHaveBeenCalledTimes(3);
  });
});
