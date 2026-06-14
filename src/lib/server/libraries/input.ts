import type { CreateLibraryInput, UpdateLibraryInput } from "./index";

type LibraryInputSource = Record<string, unknown> | FormData;

function valueFrom(input: LibraryInputSource, key: string) {
  if (!(input instanceof FormData)) return input[key];
  const values = input.getAll(key);
  return values.length > 0 ? values[values.length - 1] : null;
}

function valueFromAny(input: LibraryInputSource, keys: string[]) {
  for (const key of keys) {
    const value = valueFrom(input, key);
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

export function stringValue(input: LibraryInputSource, key: string, fallback = "") {
  return String(valueFrom(input, key) ?? fallback).trim();
}

export function rawStringValue(input: LibraryInputSource, key: string, fallback = "") {
  return String(valueFrom(input, key) ?? fallback);
}

export function numberValue(input: LibraryInputSource, key: string, fallback: number) {
  return Number(valueFrom(input, key) || fallback);
}

function booleanValue(input: LibraryInputSource, keys: string[], fallback: boolean) {
  const value = valueFromAny(input, keys);
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function optionalNumberValue(input: LibraryInputSource, keys: string[]) {
  const value = valueFromAny(input, keys);
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
}

function automationInput(input: LibraryInputSource) {
  return {
    watchEnabled: booleanValue(input, ["watchEnabled", "watch_enabled"], true),
    scanIntervalMinutes: optionalNumberValue(input, ["scanIntervalMinutes", "scan_interval_minutes"]),
  };
}

export function parseCreateLibraryInput(input: LibraryInputSource): CreateLibraryInput {
  const source = stringValue(input, "source", "local");
  const kind = stringValue(input, "kind", "movie") === "tv" ? "tv" : "movie";
  const name = stringValue(input, "name");
  const automation = automationInput(input);

  if (source === "sftp") {
    return {
      source: "sftp",
      name,
      kind,
      host: stringValue(input, "host"),
      port: numberValue(input, "port", 22),
      username: stringValue(input, "username"),
      password: rawStringValue(input, "password"),
      root: stringValue(input, "root"),
      walkConcurrency: numberValue(input, "walkConcurrency", 4),
      operationTimeoutMs: numberValue(input, "operationTimeoutMs", 30_000),
      ...automation,
    };
  }

  return {
    source: "local",
    name,
    kind,
    path: stringValue(input, "path"),
    ...automation,
  };
}

export function parseUpdateLibraryInput(input: LibraryInputSource): UpdateLibraryInput {
  const source = stringValue(input, "source", "local");
  const name = stringValue(input, "name");
  const automation = automationInput(input);

  if (source === "sftp") {
    return {
      source: "sftp",
      name,
      host: stringValue(input, "host"),
      port: numberValue(input, "port", 22),
      username: stringValue(input, "username"),
      password: rawStringValue(input, "password"),
      root: stringValue(input, "root"),
      walkConcurrency: numberValue(input, "walkConcurrency", 4),
      operationTimeoutMs: numberValue(input, "operationTimeoutMs", 30_000),
      ...automation,
    };
  }

  return {
    source: "local",
    name,
    path: stringValue(input, "path"),
    ...automation,
  };
}

export function libraryFormState(input: LibraryInputSource) {
  return {
    name: stringValue(input, "name"),
    kind: stringValue(input, "kind", "movie") === "tv" ? "tv" : "movie",
    source: stringValue(input, "source", "local"),
    path: stringValue(input, "path"),
    host: stringValue(input, "host"),
    port: numberValue(input, "port", 22),
    username: stringValue(input, "username"),
    root: stringValue(input, "root"),
    walkConcurrency: numberValue(input, "walkConcurrency", 4),
    operationTimeoutMs: numberValue(input, "operationTimeoutMs", 30_000),
    watchEnabled: booleanValue(input, ["watchEnabled", "watch_enabled"], true) ? "1" : "0",
    scanIntervalMinutes: String(optionalNumberValue(input, ["scanIntervalMinutes", "scan_interval_minutes"]) ?? ""),
  };
}
