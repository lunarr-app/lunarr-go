export async function resetAuthForTests() {
  const { rebindAuthForTests } = await import("../index");
  await rebindAuthForTests();
}
