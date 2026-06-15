import { describe, expect, test } from "bun:test";
import { movieLookupCandidates, movieLookupFromPath } from "./movie-lookup";

describe("movieLookupFromPath", () => {
  test("prefers Radarr-style parent folder title and year over noisy filenames", () => {
    expect(movieLookupFromPath("radarr/movies/Blade Runner (1982)/Blade.Runner (1997).mp4")).toEqual({
      title: "Blade Runner",
      year: 1982,
    });

    expect(
      movieLookupFromPath("radarr/movies/Pathaan (2023)/TheMoviesBoss - Pathaan.(2023).720p.AMZN.WebRip.mkv"),
    ).toEqual({ title: "Pathaan", year: 2023 });
  });

  test("uses filename parser output when no movie folder is present", () => {
    expect(movieLookupFromPath("movies/Multiplicity (1996) [REPACK] [720p].mp4")).toEqual({
      title: "Multiplicity",
      year: 1996,
    });
  });

  test("does not treat the library root as a movie folder", () => {
    expect(
      movieLookupFromPath("/media/Movies (2026)/The Matrix (1999).mkv", undefined, {
        libraryRoot: "/media/Movies (2026)",
      }),
    ).toEqual({ title: "The Matrix", year: 1999 });
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
      { title: "Disney's Snow White", year: 2025 },
      { title: "Snow White", year: 2025 },
    ]);
  });

  test("normalizes smart quotes in folder titles", () => {
    expect(movieLookupFromPath("radarr/movies/“Wuthering Heights” (2026)/Wuthering Heights (2026).mp4")).toEqual({
      title: "Wuthering Heights",
      year: 2026,
    });
  });
});
