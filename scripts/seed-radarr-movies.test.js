import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PUBLIC_TEST_VIDEOS, RADARR_MOVIE_FIXTURE, seedRadarrMovieFixture } from "./seed-radarr-movies.mjs";

describe("Radarr movie fixture seeder", () => {
  test("creates Radarr-style movie directories with small mock files by default", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-radarr-fixture-"));
    try {
      const result = await seedRadarrMovieFixture({ target: dir, limit: 3 });
      const first = RADARR_MOVIE_FIXTURE[0];
      const firstFile = path.join(dir, first.dir, first.file);
      const content = await readFile(firstFile, "utf8");

      expect(result.files).toBe(3);
      expect(content).toContain(first.dir);
      expect(content).toContain(String(first.size));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("can create sparse files that report the original remote size", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-radarr-sparse-fixture-"));
    try {
      await seedRadarrMovieFixture({ target: dir, sparse: true, limit: 1 });
      const first = RADARR_MOVIE_FIXTURE[0];
      const firstFile = path.join(dir, first.dir, first.file);

      expect((await stat(firstFile)).size).toBe(first.size);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("can seed playable sample videos from the public cache sources", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-radarr-playback-fixture-"));
    const requests = [];
    try {
      const sampleVideos = [PUBLIC_TEST_VIDEOS[0]];
      const result = await seedRadarrMovieFixture({
        target: dir,
        playback: true,
        limit: 2,
        sampleVideos,
        fetcher: async (url) => {
          requests.push(url);
          return new Response(Buffer.from("sample mp4 bytes"));
        }
      });

      const first = RADARR_MOVIE_FIXTURE[0];
      const second = RADARR_MOVIE_FIXTURE[1];

      expect(result.playback).toBe(true);
      expect(requests).toEqual([sampleVideos[0].url]);
      expect(await readFile(path.join(dir, first.dir, first.file), "utf8")).toBe("sample mp4 bytes");
      expect(await readFile(path.join(dir, second.dir, second.file), "utf8")).toBe("sample mp4 bytes");
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(path.resolve(dir, "..", ".sample-video-cache"), { recursive: true, force: true });
    }
  });
});
