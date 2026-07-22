import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEMO_MOVIES, seedDemoCollection } from "./seed-demo-collection.mjs";

describe("Demo collection seeder", () => {
  test("creates movie directories with downloaded files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-demo-seed-"));
    try {
      const requests = [];
      const mockContent = Buffer.from("fake mp4 content for testing");

      const result = await seedDemoCollection({
        target: dir,
        limit: 2,
        fetcher: async (url) => {
          requests.push(url);
          return new Response(mockContent);
        },
      });

      expect(result.files).toBe(2);
      expect(requests.length).toBe(2);

      const first = DEMO_MOVIES[0];
      const firstFile = path.join(dir, first.dir, first.file);
      const content = await readFile(firstFile);

      expect(content).toEqual(mockContent);
      expect(result.totalSize).toBe(mockContent.length * 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("creates correct directory structure", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-demo-structure-"));
    try {
      await seedDemoCollection({
        target: dir,
        limit: 1,
        fetcher: async () => new Response(Buffer.from("test")),
      });

      const first = DEMO_MOVIES[0];
      const expectedPath = path.join(dir, first.dir, first.file);
      const info = await stat(expectedPath);

      expect(info.isFile()).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--clean removes previous target directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-demo-clean-"));
    try {
      const first = DEMO_MOVIES[0];
      const existingFile = path.join(dir, first.dir, first.file);
      await mkdir(path.join(dir, first.dir), { recursive: true });
      await writeFile(existingFile, "old content");

      const content = Buffer.from("new content");
      await seedDemoCollection({
        target: dir,
        clean: true,
        limit: 1,
        fetcher: async () => new Response(content),
      });

      const newContent = await readFile(existingFile);
      expect(newContent).toEqual(content);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--limit restricts number of files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-demo-limit-"));
    try {
      const result = await seedDemoCollection({
        target: dir,
        limit: 3,
        fetcher: async () => new Response(Buffer.from("test")),
      });

      expect(result.files).toBe(3);
      expect(result.results.length).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reports file sizes and elapsed time", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-demo-meta-"));
    try {
      const content = Buffer.from("test content here");
      const result = await seedDemoCollection({
        target: dir,
        limit: 1,
        fetcher: async () => new Response(content),
      });

      expect(result.results[0].size).toBe(content.length);
      expect(Number.parseFloat(result.results[0].elapsed)).toBeGreaterThanOrEqual(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("skips download if file already exists", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-demo-skip-"));
    try {
      const first = DEMO_MOVIES[0];
      const filePath = path.join(dir, first.dir, first.file);
      await mkdir(path.join(dir, first.dir), { recursive: true });
      await writeFile(filePath, "existing content");

      let downloadCount = 0;
      await seedDemoCollection({
        target: dir,
        limit: 1,
        fetcher: async () => {
          downloadCount++;
          return new Response(Buffer.from("should not be downloaded"));
        },
      });

      expect(downloadCount).toBe(0);
      const content = await readFile(filePath, "utf8");
      expect(content).toBe("existing content");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("all demo movies have valid metadata", () => {
    for (const movie of DEMO_MOVIES) {
      expect(movie.url).toMatch(/^https?:\/\//);
      expect(movie.title).toBeTruthy();
      expect(movie.year).toBeGreaterThan(2000);
      expect(movie.dir).toBeTruthy();
      expect(movie.file).toBeTruthy();
      expect(movie.license).toBeTruthy();
      expect(movie.source).toBeTruthy();
    }
  });

  test("movie filenames match Radarr-style naming convention", () => {
    for (const movie of DEMO_MOVIES) {
      expect(movie.dir).toBe(`${movie.title} (${movie.year})`);
      expect(movie.file).toMatch(new RegExp(`^${movie.title} \\(${movie.year}\\)\\.`));
    }
  });
});
