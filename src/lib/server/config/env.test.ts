import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appEnvDefaultsForEnvironment, AUTH_SECRET_FILE, resolveAuthSecret } from "./env";

describe("appEnvDefaultsForEnvironment", () => {
  test("provides a local development origin outside production start", () => {
    expect(appEnvDefaultsForEnvironment({})).toMatchObject({
      ORIGIN: "http://127.0.0.1:5173",
    });
  });

  test("does not override an explicit auth secret", () => {
    expect(
      appEnvDefaultsForEnvironment({
        AUTH_SECRET: "configured-secret",
      }),
    ).toEqual({});
  });

  test("requires no defaults for production and packaged start", () => {
    expect(appEnvDefaultsForEnvironment({ NODE_ENV: "production" })).toEqual({});
    expect(appEnvDefaultsForEnvironment({ npm_lifecycle_event: "start" })).toEqual({});
  });

  test("keeps local origin during production-mode builds", () => {
    expect(
      appEnvDefaultsForEnvironment({
        NODE_ENV: "production",
        npm_lifecycle_event: "build",
      }),
    ).toMatchObject({
      ORIGIN: "http://127.0.0.1:5173",
    });
  });
});

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
