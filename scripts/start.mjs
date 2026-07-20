import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotenv } from "./env.mjs";

loadDotenv();

function getVersion() {
  if (process.env.LUNARR_APP_VERSION) return process.env.LUNARR_APP_VERSION;
  const pkgPath = path.resolve(fileURLToPath(import.meta.url), "../../package.json");
  return JSON.parse(readFileSync(pkgPath, "utf8")).version;
}

const arg = process.argv[2];

if (arg === "-h" || arg === "--help") {
  console.log(`Lunarr server

Usage: node scripts/start.mjs [options]

Options:
  -h, --help     Show this help message and exit
  -v, --version  Show the version and exit`);
  process.exit(0);
}

if (arg === "-v" || arg === "--version") {
  console.log(getVersion());
  process.exit(0);
}

await import("../build/index.js");
