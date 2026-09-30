import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthPage } from "./api.js";
import { getMe, homeFor, signIn, signOut } from "./auth-client.js";

function mockFetch(status = 200, body: unknown = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const callOf = (fetchMock: ReturnType<typeof mockFetch>) =>
  fetchMock.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the web auth client", () => {
  it("signs a parent in by email and a child by username", async () => {
    const fetchMock = mockFetch();
    await signIn(" parent@example.com ", "pw");
    await signIn("ivy", "pw");
    const urls = fetchMock.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(urls[0]).toMatch(/\/api\/auth\/sign-in\/email$/);
    expect(urls[1]).toMatch(/\/api\/auth\/sign-in\/username$/);
    expect(
      JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body)),
    ).toEqual({
      username: "ivy",
      password: "pw",
    });
  });

  it("★ signs out with a JSON body — Better Auth refuses a bare POST (415)", async () => {
    const fetchMock = mockFetch();
    await signOut();
    const [, init] = callOf(fetchMock);
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.credentials).toBe("include");
  });

  it("reads no session as null, not an error", async () => {
    mockFetch(401, { error: "Unauthorized" });
    await expect(getMe()).resolves.toBeNull();
  });

  it("sends a child to /child and a parent to /", () => {
    const user = { id: "u", name: "n", email: "e", username: null };
    expect(homeFor({ user: { ...user, role: "child" }, child: null })).toBe("/child");
    expect(homeFor({ user: { ...user, role: "parent" }, child: null })).toBe("/");
  });

  it("does not bounce the sign-in and join pages to themselves on a 401", () => {
    expect(isAuthPage("/sign-in")).toBe(true);
    expect(isAuthPage("/join/abc")).toBe(true);
    expect(isAuthPage("/settings/children")).toBe(false);
  });
});
