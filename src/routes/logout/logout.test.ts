import { describe, expect, mock, test } from "bun:test";
import type { RequestEvent } from "./$types";

const signOut = mock(async (_input: unknown) => ({}));

mock.module("$lib/server/auth", () => ({
  auth: {
    api: {
      signOut,
    },
  },
}));

const logoutRoutePromise = import("./+server");

function createEvent(request: Request): RequestEvent {
  return {
    request,
    locals: { session: null, user: null },
    params: {},
    route: { id: "/logout" },
    url: new URL(request.url),
    cookies: {} as RequestEvent["cookies"],
    fetch,
    getClientAddress: () => "127.0.0.1",
    isDataRequest: false,
    isSubRequest: false,
    platform: undefined,
    setHeaders: () => {},
    tracing: { enabled: false, root: {}, current: {} },
    isRemoteRequest: false,
  } as RequestEvent;
}

async function expectRedirect(operation: unknown, location: string) {
  try {
    await operation;
    throw new Error(`Expected redirect to ${location}.`);
  } catch (error) {
    expect(error).toMatchObject({
      status: 303,
      location,
    });
  }
}

describe("logout route", () => {
  test("signs out with POST and redirects to login", async () => {
    signOut.mockClear();
    const { POST } = await logoutRoutePromise;
    const request = new Request("http://localhost/logout", { method: "POST" });

    await expectRedirect(POST(createEvent(request)), "/login");

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  test("rejects GET logout requests", async () => {
    const { GET } = await logoutRoutePromise;
    const response = await GET(createEvent(new Request("http://localhost/logout")));

    expect(response.status).toBe(405);
  });
});
