import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_DEMO_TARGET = path.join(".lunarr", "fixtures", "demo", "movies");

export const DEMO_MOVIES = [
  {
    title: "Big Buck Bunny",
    year: 2008,
    dir: "Big Buck Bunny (2008)",
    file: "Big Buck Bunny (2008).mp4",
    url: "https://archive.org/download/big-buck-bunny-2008/Big%20Buck%20Bunny%20%282008%29.mp4",
    license: "CC-BY / Public Domain",
    source: "Blender Foundation",
  },
  {
    title: "Elephants Dream",
    year: 2006,
    dir: "Elephants Dream (2006)",
    file: "Elephants Dream (2006).mov",
    url: "https://download.blender.org/ED/elephantsdream-480-h264-st-aac.mov",
    license: "CC-BY 3.0",
    source: "Blender Foundation",
  },
  {
    title: "Sintel",
    year: 2010,
    dir: "Sintel (2010)",
    file: "Sintel (2010).mp4",
    url: "https://archive.org/download/Sintel/sintel-2048-stereo_512kb.mp4",
    license: "CC-BY 3.0",
    source: "Blender Foundation",
  },
  {
    title: "Tears of Steel",
    year: 2012,
    dir: "Tears of Steel (2012)",
    file: "Tears of Steel (2012).mov",
    url: "https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov",
    license: "CC-BY 3.0",
    source: "Blender Foundation",
  },
  {
    title: "Cosmos Laundromat",
    year: 2015,
    dir: "Cosmos Laundromat (2015)",
    file: "Cosmos Laundromat (2015).mp4",
    url: "https://archive.org/download/cosmos-laundromat/Cosmos%20Laundromat.mp4",
    license: "CC-BY 3.0",
    source: "Blender Foundation",
  },
  {
    title: "Sprite Fright",
    year: 2021,
    dir: "Sprite Fright (2021)",
    file: "Sprite Fright (2021).mp4",
    url: "https://archive.org/download/sprite-fright/Sprite%20Fright%20-%20Open%20Movie%20by%20Blender%20Studio-804p.mp4",
    license: "CC-BY 4.0",
    source: "Blender Studio",
  },
];

function parseArgs(argv) {
  const options = {
    target: DEFAULT_DEMO_TARGET,
    clean: false,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--clean") {
      options.clean = true;
    } else if (arg === "--target") {
      options.target = argv[index + 1] ?? options.target;
      index += 1;
    } else if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
    } else if (arg === "--limit") {
      options.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (!arg.startsWith("-")) {
      options.target = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }

  return options;
}

async function existingFileSize(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() ? info.size : 0;
  } catch {
    return 0;
  }
}

async function downloadFile(url, targetPath, { fetcher = fetch, onProgress } = {}) {
  if ((await existingFileSize(targetPath)) > 0) {
    return;
  }

  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Failed to download: HTTP ${response.status}`);
  }

  const totalBytes = Number(response.headers.get("content-length")) || null;
  const reader = response.body?.getReader();

  if (!reader) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0) throw new Error("Downloaded empty file");
    await writeFile(targetPath, body);
    onProgress?.(body.length, body.length);
    return;
  }

  const chunks = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedBytes += value.length;
    onProgress?.(receivedBytes, totalBytes);
  }

  const body = Buffer.concat(chunks);
  if (body.length === 0) {
    throw new Error("Downloaded empty file");
  }

  await writeFile(targetPath, body);
  onProgress?.(body.length, totalBytes ?? body.length);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

export async function seedDemoCollection({
  target = DEFAULT_DEMO_TARGET,
  clean = false,
  limit = null,
  fetcher = fetch,
  movies = DEMO_MOVIES,
} = {}) {
  const entries = limit === null ? movies : movies.slice(0, limit);
  const root = path.resolve(target);

  if (clean) {
    await rm(root, { recursive: true, force: true });
  }

  await mkdir(root, { recursive: true });

  const results = [];

  for (const movie of entries) {
    const directory = path.join(root, movie.dir);
    const filePath = path.join(directory, movie.file);

    await mkdir(directory, { recursive: true });

    const start = Date.now();
    let lastProgress = "";

    await downloadFile(movie.url, filePath, {
      fetcher,
      onProgress: (received, total) => {
        if (total) {
          const pct = ((received / total) * 100).toFixed(0);
          const line = `  ${movie.title} (${movie.year}) - ${formatBytes(received)} / ${formatBytes(total)} (${pct}%)`;
          if (line !== lastProgress) {
            process.stderr.write(`\r${line}`);
            lastProgress = line;
          }
        }
      },
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const info = await stat(filePath);
    results.push({ ...movie, size: info.size, elapsed });

    process.stderr.write("\r" + " ".repeat(80) + "\r");
    console.log(`  ${movie.title} (${movie.year}) - ${formatBytes(info.size)} in ${elapsed}s`);
  }

  const totalSize = results.reduce((sum, r) => sum + r.size, 0);

  return {
    root,
    files: results.length,
    totalSize,
    results,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log("Seeding demo collection...\n");
  console.log("Source: Blender Foundation open movies (Creative Commons)");
  console.log("These files will be used for app store review testing.\n");

  const result = await seedDemoCollection(options);

  console.log(`\nSeeded ${result.files} demo movies in ${result.root}`);
  console.log(`Total size: ${formatBytes(result.totalSize)}`);
  console.log("\nTo use with Lunarr:");
  console.log(`  1. Create a library with kind "movie" pointing to: ${result.root}`);
  console.log("  2. Run a scan to auto-fetch metadata from TMDb");
  console.log("  3. All posters, backdrops, cast, and genres will populate automatically");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
