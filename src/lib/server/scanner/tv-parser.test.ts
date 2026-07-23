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
      episodeTitle: "Special",
    });
  });

  test("prefers show directory context over release-name year tags", () => {
    expect(
      parseTvEpisodePath("/media/shows/What If…!/Season 2/What.If.2021.S02E01.720p.WEB.h264-EDITH.mkv", "/media/shows"),
    ).toEqual({
      showTitle: "What If…!",
      seasonNumber: 2,
      episodeNumber: 1,
      episodeTitle: "What If",
    });
  });

  test("parses multi-episode filenames (S01E01E02) to first episode", () => {
    expect(
      parseTvEpisodePath(
        "/media/shows/How I Met Your Mother/Season 7/How.I.Met.Your.Mother.S07E23E24.720p.HDTV.X264-DIMENSION.mkv",
        "/media/shows",
      ),
    ).toEqual({
      showTitle: "How I Met Your Mother",
      seasonNumber: 7,
      episodeNumber: 23,
      episodeTitle: null,
    });

    expect(
      parseTvEpisodePath(
        "/media/shows/The X-Files/Season 9/The.X-Files.S09E19E20.The.Truth.1080p.BluRay.x265.DD5.1-Pahe.in.mkv",
        "/media/shows",
      ),
    ).toEqual({
      showTitle: "The X",
      seasonNumber: 9,
      episodeNumber: 19,
      episodeTitle: "The Truth",
    });

    expect(
      parseTvEpisodePath(
        "/media/shows/Teen Titans Go/Season 3/Teen.Titans.Go.S03E35E36.Operation.Dude.Rescue.720p.HDTV.x264-W4F-Obfuscated.mkv",
        "/media/shows",
      ),
    ).toEqual({
      showTitle: "Teen Titans Go",
      seasonNumber: 3,
      episodeNumber: 35,
      episodeTitle: "Operation Dude Rescue",
    });

    expect(
      parseTvEpisodePath(
        "/media/shows/The Garfield Show/Season 4/The.Garfield.Show.S04E53E54.1080p.NF.WEB-DL.DDP2.0.x264.1-AJP69-Obfuscated.mkv",
        "/media/shows",
      ),
    ).toEqual({
      showTitle: "The Garfield Show",
      seasonNumber: 4,
      episodeNumber: 53,
      episodeTitle: null,
    });
  });

  test("parses anime absolute episode filenames", () => {
    expect(
      parseTvEpisodePath(
        "/media/anime/Pokemon/Season 1/[Ioroid] Uma Musume Pretty Derby - Road to the Top - 04 [AMZN WEB-DL 1080p AVC E-AC3].mkv",
        "/media/anime",
      ),
    ).toEqual({
      showTitle: "Pokemon",
      seasonNumber: 1,
      episodeNumber: 4,
      episodeTitle: "Road to the Top",
    });

    expect(
      parseTvEpisodePath(
        "/media/anime/Naruto/Season 3/[Erai-raws] Busamen Gachi Fighter-12 [1080p CR WEB-DL AVC AAC][MultiSub][7470E7AC].mkv",
        "/media/anime",
      ),
    ).toEqual({
      showTitle: "Naruto",
      seasonNumber: 3,
      episodeNumber: 12,
      episodeTitle: "Busamen Gachi Fighter",
    });
  });

  test("handles titles returned as arrays from full paths", () => {
    expect(
      parseTvEpisodePath(
        "/sonarr/tv/Avatar - The Last Airbender (2024)/Season 2/Avatar The Last Airbender 2024 S02E07 480p x264-mSD.mkv",
      ),
    ).toEqual({
      showTitle: "Avatar The Last Airbender",
      seasonNumber: 2,
      episodeNumber: 7,
      episodeTitle: null,
    });

    expect(
      parseTvEpisodePath(
        "/sonarr/tv/Avatar - The Last Airbender (2024)/Season 1/Avatar.The.Last.Airbender.2024.S01E08.WEB.x264-TORRENTGALAXY[TGx].mkv",
      ),
    ).toEqual({
      showTitle: "Avatar The Last Airbender",
      seasonNumber: 1,
      episodeNumber: 8,
      episodeTitle: null,
    });
  });

  test("returns null when no episode number can be found", () => {
    expect(parseTvEpisodePath("/media/shows/The Expanse/behind-the-scenes.mkv", "/media/shows")).toBeNull();
  });
});
