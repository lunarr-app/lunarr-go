import { describe, expect, test } from "bun:test";
import { movieLookupCandidates } from "./movie-lookup";

describe("movieLookupCandidates first candidate", () => {
  test("prefers Radarr-style parent folder title and year over noisy filenames", () => {
    expect(movieLookupCandidates("radarr/movies/Blade Runner (1982)/Blade.Runner (1997).mp4")[0]).toEqual({
      title: "Blade Runner",
      year: 1982,
    });

    expect(
      movieLookupCandidates("radarr/movies/Pathaan (2023)/TheMoviesBoss - Pathaan.(2023).720p.AMZN.WebRip.mkv")[0],
    ).toEqual({ title: "Pathaan", year: 2023 });
  });

  test("uses filename parser output when no movie folder is present", () => {
    expect(movieLookupCandidates("movies/Multiplicity (1996) [REPACK] [720p].mp4")[0]).toEqual({
      title: "Multiplicity",
      year: 1996,
    });
  });

  test("does not treat the library root as a movie folder", () => {
    expect(
      movieLookupCandidates("/media/Movies (2026)/The Matrix (1999).mkv", undefined, {
        libraryRoot: "/media/Movies (2026)",
      })[0],
    ).toEqual({ title: "The Matrix", year: 1999 });
  });

  test("keeps the full title for 'Title - Subtitle' folders instead of just the subtitle", () => {
    expect(movieLookupCandidates("movies/X-Men - First Class (2011)/X-Men - First Class (2011).mkv")[0]).toEqual({
      title: "X-Men First Class",
      year: 2011,
    });
  });

  test("normalizes array titles and drops noise tokens instead of crashing", () => {
    expect(movieLookupCandidates("movies/The.Movie.2020.TV.HDTV.mkv")[0]).toEqual({
      title: "The Movie",
      year: 2020,
    });
  });
});

describe("movieLookupCandidates", () => {
  test("keeps folder first and adds filename year when it differs", () => {
    expect(
      movieLookupCandidates("radarr/movies/Redux Redux (2026)/Redux Redux (2025) [720p] [WEBRip] [YTS.BZ].mp4"),
    ).toEqual([
      { title: "Redux Redux", year: 2026 },
      { title: "Redux Redux", year: 2025 },
    ]);
  });

  test("adds a filename title candidate when it differs from the folder title", () => {
    expect(
      movieLookupCandidates("radarr/movies/Disney's Snow White (2025)/Snow White (2025) 720p WEBRip-LAMA.mp4"),
    ).toEqual([
      { title: "Snow White", year: 2025 },
      { title: "Disney's Snow White", year: 2025 },
    ]);
  });

  test("keeps folder first when the filename only adds release-group noise", () => {
    expect(
      movieLookupCandidates("radarr/movies/Pathaan (2023)/TheMoviesBoss - Pathaan.(2023).720p.AMZN.WebRip.mkv"),
    ).toEqual([{ title: "Pathaan", year: 2023 }]);
  });

  test("prefers filename title over a mismatched parent folder", () => {
    expect(
      movieLookupCandidates("radarr/movies/Three (2006)/Survival Island (2005) [720p] [WEBRip] [YTS.MX].mp4"),
    ).toEqual([
      { title: "Survival Island", year: 2005 },
      { title: "Three", year: 2006 },
      { title: "Three", year: 2005 },
    ]);
  });

  test("normalizes smart quotes in folder titles", () => {
    expect(
      movieLookupCandidates("radarr/movies/\u201CWuthering Heights\u201D (2026)/Wuthering Heights (2026).mp4")[0],
    ).toEqual({
      title: "Wuthering Heights",
      year: 2026,
    });
  });
});
