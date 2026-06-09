import type { CreateLibraryInput, UpdateLibraryInput } from "./index";

type LibraryInputSource = Record<string, unknown> | FormData;

function valueFrom(input: LibraryInputSource, key: string) {
  return input instanceof FormData ? input.get(key) : input[key];
}

export function stringValue(
  input: LibraryInputSource,
  key: string,
  fallback = "",
) {
  return String(valueFrom(input, key) ?? fallback).trim();
}

export function rawStringValue(
  input: LibraryInputSource,
  key: string,
  fallback = "",
) {
  return String(valueFrom(input, key) ?? fallback);
}

export function numberValue(
  input: LibraryInputSource,
  key: string,
  fallback: number,
) {
  return Number(valueFrom(input, key) || fallback);
}

export function parseCreateLibraryInput(
  input: LibraryInputSource,
): CreateLibraryInput {
  const source = stringValue(input, "source", "local");
  const kind = stringValue(input, "kind", "movie") === "tv" ? "tv" : "movie";
  const name = stringValue(input, "name");

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
    };
  }

  return {
    source: "local",
    name,
    kind,
    path: stringValue(input, "path"),
  };
}

export function parseUpdateLibraryInput(
  input: LibraryInputSource,
): UpdateLibraryInput {
  const source = stringValue(input, "source", "local");
  const name = stringValue(input, "name");

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
    };
  }

  return {
    source: "local",
    name,
    path: stringValue(input, "path"),
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
  };
}
