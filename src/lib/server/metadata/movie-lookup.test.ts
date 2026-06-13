import { describe, expect, test } from "bun:test";
import { movieLookupFromPath } from "./movie-lookup";

describe("movieLookupFromPath", () => {
  test("prefers Radarr-style parent folder title and year over noisy filenames", () => {
    expect(
      movieLookupFromPath(
        "radarr/movies/Blade Runner (1982)/Blade.Runner (1997).mp4",
      ),
    ).toEqual({ title: "Blade Runner", year: 1982 });

    expect(
      movieLookupFromPath(
        "radarr/movies/Pathaan (2023)/TheMoviesBoss - Pathaan.(2023).720p.AMZN.WebRip.mkv",
      ),
    ).toEqual({ title: "Pathaan", year: 2023 });
  });

  test("uses filename parser output when no movie folder is present", () => {
    expect(
      movieLookupFromPath("movies/Multiplicity (1996) [REPACK] [720p].mp4"),
    ).toEqual({ title: "Multiplicity", year: 1996 });
  });

  test("does not treat the library root as a movie folder", () => {
    expect(
      movieLookupFromPath(
        "/media/Movies (2026)/The Matrix (1999).mkv",
        undefined,
        { libraryRoot: "/media/Movies (2026)" },
      ),
    ).toEqual({ title: "The Matrix", year: 1999 });
  });
});
