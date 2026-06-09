import { describe, expect, test } from "bun:test";
import { tmdbImageUrl } from "./images";

describe("tmdbImageUrl", () => {
  test("returns null for missing paths", () => {
    expect(tmdbImageUrl(null)).toBeNull();
    expect(tmdbImageUrl(undefined)).toBeNull();
    expect(tmdbImageUrl("")).toBeNull();
  });

  test("builds TMDb image URLs with the requested size", () => {
    expect(tmdbImageUrl("/poster.jpg")).toBe("https://image.tmdb.org/t/p/w342/poster.jpg");
    expect(tmdbImageUrl("poster.jpg", "w500")).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
  });

  test("preserves absolute image URLs", () => {
    expect(tmdbImageUrl("https://cdn.example/poster.jpg")).toBe("https://cdn.example/poster.jpg");
    expect(tmdbImageUrl("http://cdn.example/poster.jpg")).toBe("http://cdn.example/poster.jpg");
  });
});
