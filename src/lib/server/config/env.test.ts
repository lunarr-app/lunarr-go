import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AUTH_SECRET_FILE, resolveAuthSecret } from "./env";

describe("resolveAuthSecret", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lunarr-env-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns the provided secret without touching the data dir", () => {
    expect(resolveAuthSecret(dir, "provided-secret")).toBe("provided-secret");
  });

  test("generates and persists a secret on first run", () => {
    const secret = resolveAuthSecret(dir, undefined);
    expect(secret.length).toBeGreaterThanOrEqual(32);

    const persisted = readFileSync(join(dir, AUTH_SECRET_FILE), "utf8").trim();
    expect(persisted).toBe(secret);
  });

  test("reuses the persisted secret on later starts", () => {
    const first = resolveAuthSecret(dir, undefined);
    const second = resolveAuthSecret(dir, undefined);
    expect(second).toBe(first);
  });

  test("prefers a provided secret over the persisted file", () => {
    writeFileSync(join(dir, AUTH_SECRET_FILE), "persisted-secret");
    expect(resolveAuthSecret(dir, "override-secret")).toBe("override-secret");
  });

  test("throws instead of overwriting an unreadable persisted secret file", () => {
    const secretPath = join(dir, AUTH_SECRET_FILE);
    writeFileSync(secretPath, "persisted-secret");
    chmodSync(secretPath, 0o000);

    expect(() => resolveAuthSecret(dir, undefined)).toThrow(/Unable to read persisted auth secret/);

    chmodSync(secretPath, 0o600);
    expect(readFileSync(secretPath, "utf8").trim()).toBe("persisted-secret");
  });
});
