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
      showTitle: "The X Files",
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

  test("recognizes localized season directory names", () => {
    const cases: Array<[string, string, string, number, number]> = [
      ["/media/Series/Xena (1995)/Staffel 4/S04E05 - Krieg und Frieden.avi", "/media/Series", "Xena", 4, 5],
      ["/media/series/Kaamelott/Saison 1/Kaamelott.S01E01.mkv", "/media/series", "Kaamelott", 1, 1],
      ["/media/series/Pepita/Stagione 2/Pepita.S02E03.mkv", "/media/series", "Pepita", 2, 3],
      [
        "/media/series/La Casa de Papel/Temporada 3/La.Casa.de.Papel.S03E01.mkv",
        "/media/series",
        "La Casa de Papel",
        3,
        1,
      ],
      ["/media/series/Flikken/Seizoen 5/Flikken.S05E04.mkv", "/media/series", "Flikken", 5, 4],
      ["/media/series/Wiedźmin/Sezon 3/Wiedzmin.S03E01.mkv", "/media/series", "Wiedźmin", 3, 1],
      ["/media/series/Bron/Säsong 2/Bron.S02E01.mkv", "/media/series", "Bron", 2, 1],
      ["/media/series/Stromann/Évad 1/Stromann.S01E02.mkv", "/media/series", "Stromann", 1, 2],
      ["/media/series/Бригада/Сезон 1/Бригада.S01E01.mkv", "/media/series", "Бригада", 1, 1],
      ["/media/series/シリーズ/シーズン 2/Episode.S02E01.mkv", "/media/series", "シリーズ", 2, 1],
    ];

    for (const [path, root, showTitle, seasonNumber, episodeNumber] of cases) {
      expect(parseTvEpisodePath(path, root)).toEqual({ showTitle, seasonNumber, episodeNumber, episodeTitle: null });
    }
  });

  test("falls back to digit-based season detection for unrecognized season dirs", () => {
    expect(
      parseTvEpisodePath("/media/Series/Xena (1995)/सीजन 4/S04E05 - Krieg und Frieden.avi", "/media/Series"),
    ).toEqual({
      showTitle: "Xena",
      seasonNumber: 4,
      episodeNumber: 5,
      episodeTitle: null,
    });
  });

  test("does not treat numeric show directories as season directories", () => {
    expect(parseTvEpisodePath("/media/shows/Category/24/24.S02E03.mkv", "/media/shows")).toEqual({
      showTitle: "24",
      seasonNumber: 2,
      episodeNumber: 3,
      episodeTitle: null,
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

  test("uses filename title for flat layouts without a season directory", () => {
    expect(parseTvEpisodePath("/media/shows/The X-Files/The.X-Files.S09E19.mkv", "/media/shows")).toEqual({
      showTitle: "The X Files",
      seasonNumber: 9,
      episodeNumber: 19,
      episodeTitle: null,
    });
  });

  test("strips a trailing year from directory-derived show titles", () => {
    expect(
      parseTvEpisodePath("/media/shows/Some.Show.2020/Season 1/Some.Show.2020.S01E01.mkv", "/media/shows"),
    ).toEqual({
      showTitle: "Some Show",
      seasonNumber: 1,
      episodeNumber: 1,
      episodeTitle: null,
    });
  });

  test("keeps episode titles like Pilot", () => {
    expect(parseTvEpisodePath("/media/shows/Lost/Season 1/Lost.S01E01.Pilot.mkv", "/media/shows")).toEqual({
      showTitle: "Lost",
      seasonNumber: 1,
      episodeNumber: 1,
      episodeTitle: "Pilot",
    });
  });

  test("prefers the fuller alternative title over a generic episode detail", () => {
    expect(
      parseTvEpisodePath("/media/shows/The Expanse/Specials/The.Expanse.S00E01.Christmas.Special.mkv", "/media/shows"),
    ).toEqual({
      showTitle: "The Expanse",
      seasonNumber: 0,
      episodeNumber: 1,
      episodeTitle: "Christmas Special",
    });

    expect(
      parseTvEpisodePath("/media/shows/The Expanse/Specials/The.Expanse.S00E01.Special.Homecoming.mkv", "/media/shows"),
    ).toEqual({
      showTitle: "The Expanse",
      seasonNumber: 0,
      episodeNumber: 1,
      episodeTitle: "Special Homecoming",
    });
  });

  test("falls back to filename title when the season directory sits at the library root", () => {
    expect(parseTvEpisodePath("/show/Season 1/The.Expanse.S02E03.mkv", "/show")).toEqual({
      showTitle: "The Expanse",
      seasonNumber: 2,
      episodeNumber: 3,
      episodeTitle: null,
    });
  });

  test("extracts season and episode from hash-like filenames guessit cannot parse", () => {
    expect(
      parseTvEpisodePath("/media/Series/Under the Dome/Season 02/euhd-dome-s02e13-720p.mkv", "/media/Series"),
    ).toEqual({
      showTitle: "Under the Dome",
      seasonNumber: 2,
      episodeNumber: 13,
      episodeTitle: null,
    });
  });

  test("returns null when no episode number can be found", () => {
    expect(parseTvEpisodePath("/media/shows/The Expanse/behind-the-scenes.mkv", "/media/shows")).toBeNull();
  });
});
