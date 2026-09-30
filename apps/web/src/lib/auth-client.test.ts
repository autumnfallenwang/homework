import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthPage } from "./api.js";
import {
  accountPathFor,
  changePassword,
  getMe,
  homeFor,
  signIn,
  signOut,
  updateMe,
} from "./auth-client.js";

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
  it("signs every login in by email (ADR 0005)", async () => {
    const fetchMock = mockFetch();
    await signIn(" ivy@example.com ", "pw");
    const [url, init] = callOf(fetchMock);
    expect(url).toMatch(/\/api\/auth\/sign-in\/email$/);
    expect(JSON.parse(String(init.body))).toEqual({ email: "ivy@example.com", password: "pw" });
  });

  it("changes your own login through PATCH /api/me", async () => {
    const fetchMock = mockFetch();
    await updateMe({ email: "new@example.com" });
    const [url, init] = callOf(fetchMock);
    expect(url).toMatch(/\/api\/me$/);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ email: "new@example.com" });
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
    const user = { id: "u", name: "n", email: "e" };
    expect(homeFor({ user: { ...user, role: "child" }, child: null })).toBe("/child");
    expect(homeFor({ user: { ...user, role: "parent" }, child: null })).toBe("/");
  });

  it("does not bounce the sign-in and join pages to themselves on a 401", () => {
    expect(isAuthPage("/sign-in")).toBe(true);
    expect(isAuthPage("/join/abc")).toBe(true);
    expect(isAuthPage("/settings/children")).toBe(false);
  });

  it("changes a password and signs out every OTHER device", async () => {
    const fetchMock = mockFetch();
    await changePassword("old-one-1", "new-one-2");
    const [url, init] = callOf(fetchMock);
    expect(url).toMatch(/\/api\/auth\/change-password$/);
    expect(JSON.parse(String(init.body))).toEqual({
      currentPassword: "old-one-1",
      newPassword: "new-one-2",
      revokeOtherSessions: true,
    });
  });

  it("opens each role's own Account page", () => {
    expect(accountPathFor("parent")).toBe("/settings/account");
    expect(accountPathFor("child")).toBe("/child/settings/account");
  });
});
