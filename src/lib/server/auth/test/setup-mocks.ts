import { mock } from "bun:test";

mock.module("$app/env", () => ({
  browser: false,
  building: false,
  dev: false,
  version: "test",
}));

mock.module("$app/server", () => ({
  getRequestEvent: () => ({
    cookies: {
      set: () => {},
      get: () => undefined,
      delete: () => {},
    },
  }),
}));
