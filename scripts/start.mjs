import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotenv, resolveOrigin } from "./env.mjs";

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

const origin = resolveOrigin(process.env);

// adapter-node 6 dropped the runtime ORIGIN env var (paths.origin is
// build-time only), so hand the runtime ORIGIN to SvelteKit via the forwarded
// headers it derives request URLs from. Without this, plain HTTP form
// submissions fail the CSRF check. The env vars must be set before the server
// module loads.
process.env.PROTOCOL_HEADER = "x-forwarded-proto";
process.env.HOST_HEADER = "x-forwarded-host";

const { server } = await import("../build/index.js");

const forwardedOrigin = new URL(origin);
server.prependListener("request", (request) => {
  request.headers["x-forwarded-proto"] = forwardedOrigin.protocol.slice(0, -1);
  request.headers["x-forwarded-host"] = forwardedOrigin.host;
});
