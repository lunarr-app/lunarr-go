import { readFileSync } from "node:fs";
import path from "node:path";

export function parseDotenvLine(line) {
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

export function loadDotenv({ cwd = process.cwd(), env = process.env } = {}) {
  let source;
  try {
    source = readFileSync(path.resolve(cwd, ".env"), "utf8");
  } catch {
    return 0;
  }

  let loaded = 0;
  for (const line of source.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (parsed && env[parsed.key] === undefined) {
      env[parsed.key] = parsed.value;
      loaded += 1;
    }
  }

  return loaded;
}
