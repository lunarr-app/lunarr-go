import { describe, expect, test } from "bun:test";
import { parseTvEpisodePath } from "./tv-parser";

describe("parseTvEpisodePath", () => {
  test("parses common season episode filenames", () => {
    expect(
      parseTvEpisodePath("/media/shows/The Expanse/Season 01/The Expanse - S01E02 - The Big Empty.mkv", "/media/shows"),
    ).toEqual({
      showTitle: "The Expanse",
      seasonNumber: 1,
      episodeNumber: 2,
      episodeTitle: "The Big Empty",
    });

    expect(parseTvEpisodePath("/media/shows/The.Expanse.S02E03.mkv", "/media/shows")).toEqual({
      showTitle: "The Expanse",
      seasonNumber: 2,
      episodeNumber: 3,
      episodeTitle: null,
    });

    expect(parseTvEpisodePath("/media/shows/The Expanse/The Expanse 3x04.mkv", "/media/shows")).toEqual({
      showTitle: "The Expanse",
      seasonNumber: 3,
      episodeNumber: 4,
      episodeTitle: null,
    });
  });

  test("uses directory context for short episode filenames and specials", () => {
    expect(parseTvEpisodePath("/media/shows/The Expanse/Season 1/02 - The Big Empty.mkv", "/media/shows")).toEqual({
      showTitle: "The Expanse",
      seasonNumber: 1,
      episodeNumber: 2,
      episodeTitle: "The Big Empty",
    });

    expect(parseTvEpisodePath("/media/shows/The Expanse/Specials/S00E01.mkv", "/media/shows")).toEqual({
      showTitle: "The Expanse",
      seasonNumber: 0,
      episodeNumber: 1,
      episodeTitle: null,
    });
  });

  test("prefers show directory context over release-name year tags", () => {
    expect(
      parseTvEpisodePath("/media/shows/What If…!/Season 2/What.If.2021.S02E01.720p.WEB.h264-EDITH.mkv", "/media/shows"),
    ).toEqual({
      showTitle: "What If…!",
      seasonNumber: 2,
      episodeNumber: 1,
      episodeTitle: "720p WEB h264 EDITH",
    });
  });

  test("returns null when no episode number can be found", () => {
    expect(parseTvEpisodePath("/media/shows/The Expanse/behind-the-scenes.mkv", "/media/shows")).toBeNull();
  });
});
