import { mock } from "bun:test";

mock.module("$app/environment", () => ({
  building: false,
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
