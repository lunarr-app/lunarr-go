import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const runtimeRoots = ["src/lib", "src/routes", "scripts"];
const metadataFiles = ["package.json", "bun.lock"];
const sourceExtensions = new Set([".js", ".mjs", ".svelte", ".ts", ".json", ".lock"]);
const allowedFfmpegFiles = new Set([
  "package.json",
  "scripts/smoke-ffmpeg-hardware.mjs",
  "scripts/smoke-ffmpeg-transcode.mjs",
  "scripts/verify-ffmpeg.mjs",
  "scripts/verify-nodeav-probe.mjs",
  "scripts/verify-runtime.mjs",
  "src/lib/server/transcoding/ffmpeg-cli.ts",
  "src/lib/server/transcoding/playback-backend.ts",
  "src/lib/server/transcoding/input-proxy.ts",
  "src/lib/server/transcoding/manager.ts",
  "src/routes/(app)/settings/+page.svelte",
]);
const allowedProcessFiles = new Set([
  "scripts/smoke-ffmpeg-transcode.mjs",
  "scripts/verify-ffmpeg.mjs",
  "src/lib/server/transcoding/ffmpeg-cli.ts",
]);
const forbiddenEverywherePatterns = [/\bffprobe\b/i, /\bfluent-ffmpeg\b/i];
const ffmpegCliPatterns = [/\bffmpeg\b/i];
const processCliPatterns = [/\bchild_process\b/, /\bexecFile\s*\(/, /\bspawn\s*\(/];
const nodeAvPlaybackPatterns = [
  /\bnodeAvBackend\s*\.\s*startCompatibilityHls\b/,
  /\bnodeAvBackend\s*\.\s*generateHlsSegmentWindow\b/,
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
  test("keeps FFmpeg CLI usage scoped to the playback backend", async () => {
    const root = process.cwd();
    const files = [
      ...metadataFiles.map((file) => path.join(root, file)),
      ...(await Promise.all(runtimeRoots.map((directory) => runtimeSourceFiles(path.join(root, directory))))).flat(),
    ];
    const offenders: string[] = [];

    for (const file of files) {
      const text = await readFile(file, "utf8");
      const relativeFile = path.relative(root, file);

      for (const pattern of forbiddenEverywherePatterns) {
        if (pattern.test(text)) {
          offenders.push(`${relativeFile} matched ${pattern}`);
        }
      }

      for (const pattern of ffmpegCliPatterns) {
        if (pattern.test(text) && !allowedFfmpegFiles.has(relativeFile)) {
          offenders.push(`${relativeFile} matched ${pattern}`);
        }
      }

      for (const pattern of processCliPatterns) {
        if (pattern.test(text) && !allowedProcessFiles.has(relativeFile)) {
          offenders.push(`${relativeFile} matched ${pattern}`);
        }
      }

      for (const pattern of nodeAvPlaybackPatterns) {
        if (pattern.test(text)) {
          offenders.push(`${relativeFile} matched ${pattern}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("keeps NodeAV scoped to the probe backend", async () => {
    const text = await readFile(path.join(process.cwd(), "src/lib/server/transcoding/node-av.ts"), "utf8");

    expect(text).toContain("export const nodeAvBackend: ProbeBackend =");
    expect(text).not.toMatch(/export const nodeAvBackend:[\s\S]*TranscodeBackend[\s\S]*=/);
    expect(text).not.toMatch(/\bHls[A-Z]/);
    expect(text).not.toMatch(/\bMuxer\b/);
    expect(text).not.toMatch(/\bEncoder\b/);
    expect(text).not.toMatch(/\bHardwareContext\b/);
    expect(text).not.toMatch(/\bgenerated HLS segment\b/i);
  });
});
