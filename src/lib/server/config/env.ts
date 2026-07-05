import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

function parseDotenvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;

  const source = trimmed.startsWith("export ") ? trimmed.slice(7).trimStart() : trimmed;
  const separatorIndex = source.indexOf("=");
  if (separatorIndex <= 0) return undefined;

  const key = source.slice(0, separatorIndex).trim();
  let value = source.slice(separatorIndex + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return undefined;

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadDotenv() {
  let source: string;
  try {
    source = readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
  } catch {
    return;
  }

  for (const line of source.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (parsed && process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

const envSchema = z.object({
  AUTH_SECRET: z.string().trim().min(32, "AUTH_SECRET must be at least 32 characters."),
  ORIGIN: z.url().trim().default("http://127.0.0.1:5173"),
  LUNARR_DATA_DIR: z.string().trim().min(1).default(".lunarr"),
  LUNARR_WATCH_USE_POLLING: z
    .preprocess(
      (value) => (value === undefined || value === "" ? undefined : String(value).trim().toLowerCase()),
      z.enum(["1", "true", "yes", "on", "0", "false", "no", "off"]).default("false"),
    )
    .transform((value) => ["1", "true", "yes", "on"].includes(value)),
  LUNARR_WATCH_INTERVAL_MS: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().min(1_000).max(60_000).default(5_000),
  ),
  LUNARR_WATCH_BINARY_INTERVAL_MS: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().min(1_000).max(120_000).default(10_000),
  ),
  LUNARR_WATCH_DEBOUNCE_MS: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().min(1_000).max(300_000).default(5_000),
  ),
  LUNARR_WATCH_WRITE_STABILITY_MS: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().min(1_000).max(300_000).default(10_000),
  ),
  LUNARR_SIGNED_PLAYBACK_TOKEN_TTL_SECONDS: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce
      .number()
      .int()
      .min(300)
      .max(604_800)
      .default(8 * 60 * 60),
  ),
  LUNARR_DEVICE_PAIRING_API_KEY_EXPIRES_IN_DAYS: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().min(0).max(3650).default(730),
  ),
});

export function appEnvDefaultsForEnvironment(env: NodeJS.ProcessEnv) {
  const lifecycle = env.npm_lifecycle_event;
  if (env.AUTH_SECRET || lifecycle === "start" || (env.NODE_ENV === "production" && lifecycle !== "build")) {
    return {};
  }

  return {
    AUTH_SECRET: "lunarr-local-development-secret-value",
    ORIGIN: "http://127.0.0.1:5173",
  };
}

function parseAppEnv() {
  loadDotenv();
  const result = envSchema.safeParse({
    ...appEnvDefaultsForEnvironment(process.env),
    ...process.env,
  });
  if (result.success) return result.data;

  const message = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid Lunarr environment: ${message}`);
}

export const appEnv = parseAppEnv();
