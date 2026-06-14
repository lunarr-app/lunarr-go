import { describe, expect, test } from "bun:test";
import { appEnvDefaultsForEnvironment } from "./env";

describe("appEnvDefaultsForEnvironment", () => {
  test("provides a local development auth secret outside production start", () => {
    expect(appEnvDefaultsForEnvironment({})).toMatchObject({
      AUTH_SECRET: "lunarr-local-development-secret-value",
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

  test("requires an explicit auth secret for production and packaged start", () => {
    expect(appEnvDefaultsForEnvironment({ NODE_ENV: "production" })).toEqual({});
    expect(appEnvDefaultsForEnvironment({ npm_lifecycle_event: "start" })).toEqual({});
  });

  test("keeps local defaults available during production-mode builds", () => {
    expect(
      appEnvDefaultsForEnvironment({
        NODE_ENV: "production",
        npm_lifecycle_event: "build",
      }),
    ).toMatchObject({
      AUTH_SECRET: "lunarr-local-development-secret-value",
    });
  });
});
