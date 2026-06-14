export async function resetAuthForTests() {
  const { rebindAuthForTests } = await import("../index");
  await rebindAuthForTests();
}

export { sessionHeadersFor } from "./session-headers";
export { createApiKeyForUser } from "./create-api-key-for-user";
