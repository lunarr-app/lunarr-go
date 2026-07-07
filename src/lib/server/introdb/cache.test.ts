import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
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

let clearIntroDbMediaCacheForTests: typeof import("./index").clearIntroDbMediaCacheForTests;
let fetchIntroDbMedia: typeof import("./index").fetchIntroDbMedia;

beforeAll(async () => {
  const introdb = await import("./index");
  clearIntroDbMediaCacheForTests = introdb.clearIntroDbMediaCacheForTests;
  fetchIntroDbMedia = introdb.fetchIntroDbMedia;
});

afterEach(() => {
  clearIntroDbMediaCacheForTests();
  getMedia.mockClear();
});

describe("introDb media cache", () => {
  test("reuses cached IntroDB responses for the same lookup", async () => {
    const lookup = { tmdbId: 603 };

    await expect(fetchIntroDbMedia(lookup, 7200)).resolves.toEqual(sampleRecord);
    await expect(fetchIntroDbMedia(lookup, 7200)).resolves.toEqual(sampleRecord);

    expect(getMedia).toHaveBeenCalledTimes(1);
  });

  test("deduplicates concurrent IntroDB requests", async () => {
    const lookup = { tmdbId: 603 };
    const [first, second] = await Promise.all([fetchIntroDbMedia(lookup), fetchIntroDbMedia(lookup)]);

    expect(first).toEqual(sampleRecord);
    expect(second).toEqual(sampleRecord);
    expect(getMedia).toHaveBeenCalledTimes(1);
  });

  test("does not cache failed IntroDB requests", async () => {
    getMedia.mockImplementationOnce(async () => {
      throw new Error("IntroDB unavailable");
    });

    await expect(fetchIntroDbMedia({ tmdbId: 603 })).resolves.toBeNull();
    await expect(fetchIntroDbMedia({ tmdbId: 603 })).resolves.toEqual(sampleRecord);

    expect(getMedia).toHaveBeenCalledTimes(2);
  });
});
