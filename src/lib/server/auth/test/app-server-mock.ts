export function mockAppServerForAuthTests() {
  return {
    getRequestEvent: () => ({
      cookies: {
        set: () => {},
        get: () => undefined,
        delete: () => {},
      },
    }),
  };
}
