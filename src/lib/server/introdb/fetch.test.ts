import { afterEach, describe, expect, mock, test } from "bun:test";
import { fetchIntroDbMedia } from "./index";
import type { MediaRecord } from "theintrodb";

const sampleRecord: MediaRecord = {
  tmdbId: 603,
  type: "movie",
  intro: [{ startMs: 0, endMs: 90_000, durationMs: 90_000, startsAtBeginning: true, endsAtMediaEnd: false }],
  recap: [],
  credits: [],
  preview: [],
};

const getMedia = mock(async () => sampleRecord);

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
});
