import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const runtimeRoots = ["src/lib", "src/routes", "scripts"];
const metadataFiles = ["package.json", "bun.lock"];
const sourceExtensions = new Set([
  ".js",
  ".mjs",
  ".svelte",
  ".ts",
  ".json",
  ".lock",
]);
const forbiddenMediaCliPatterns = [
  /\bffmpeg\b/i,
  /\bffprobe\b/i,
  /\bfluent-ffmpeg\b/i,
  /\bchild_process\b/,
  /\bexecFile\s*\(/,
  /\bspawn\s*\(/,
];

async function runtimeSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await runtimeSourceFiles(entryPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.includes(".test.")) continue;
    if (!sourceExtensions.has(path.extname(entry.name))) continue;
    files.push(entryPath);
  }

  return files;
}

describe("transcoding backend contract", () => {
  test("does not add ffmpeg, ffprobe, or shell media fallback paths", async () => {
    const root = process.cwd();
    const files = [
      ...metadataFiles.map((file) => path.join(root, file)),
      ...(await Promise.all(
        runtimeRoots.map((directory) => runtimeSourceFiles(path.join(root, directory))),
      )).flat(),
    ];
    const offenders: string[] = [];

    for (const file of files) {
      const text = await readFile(file, "utf8");
      for (const pattern of forbiddenMediaCliPatterns) {
        if (pattern.test(text)) {
          offenders.push(`${path.relative(root, file)} matched ${pattern}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
