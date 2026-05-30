import { describe, expect, it, vi } from "vitest";
import { buildLoginFormBody, extractLoginFormFields, login } from "./teacherease.js";
import { type FetchImpl, LoginError } from "./types.js";

const LOGIN_HTML = `<html><body><form>
  <input type="hidden" name="__RequestVerificationToken" value="tok123" />
  <input type="hidden" name="LoginRequestID" value="req456" />
  <input type="text" name="email" />
</form></body></html>`;

function res(opts: {
  status?: number;
  ok?: boolean;
  url?: string;
  type?: string;
  body?: string;
  setCookie?: string[];
}): Response {
  return {
    status: opts.status ?? 200,
    ok: opts.ok ?? true,
    url: opts.url ?? "https://x.example.com/common/login.aspx",
    type: opts.type ?? "basic",
    text: async () => opts.body ?? "",
    headers: { getSetCookie: () => opts.setCookie ?? [] },
  } as unknown as Response;
}

describe("extractLoginFormFields", () => {
  it("extracts only hidden inputs with names", () => {
    expect(extractLoginFormFields(LOGIN_HTML)).toEqual({
      __RequestVerificationToken: "tok123",
      LoginRequestID: "req456",
    });
  });

  it("returns {} when there is no form", () => {
    expect(extractLoginFormFields("<html><body>no form</body></html>")).toEqual({});
  });
});

describe("buildLoginFormBody", () => {
  it("merges hidden fields with credentials", () => {
    const body = buildLoginFormBody(
      { token: "abc" },
      { username: "u@e.com", password: "p@ss word" },
    );
    const params = new URLSearchParams(body);
    expect(params.get("token")).toBe("abc");
    expect(params.get("email")).toBe("u@e.com");
    expect(params.get("password")).toBe("p@ss word");
  });
});

describe("login", () => {
  it("returns a session on a 302 redirect", async () => {
    const fetchImpl: FetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ body: LOGIN_HTML, setCookie: ["ASP.NET_SessionId=s1; Path=/"] }))
      .mockResolvedValueOnce(res({ status: 302, setCookie: ["auth=tok; Path=/"] }));
    const session = await login(
      "https://x.example.com",
      { username: "u", password: "p" },
      fetchImpl,
    );
    expect(session.baseUrl).toBe("https://x.example.com");
    expect(session.cookieHeader).toContain("auth=tok");
  });

  it("returns a session on a 200 whose final URL is off the login page", async () => {
    const fetchImpl: FetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ body: LOGIN_HTML }))
      .mockResolvedValueOnce(res({ status: 200, url: "https://x.example.com/App/Parents/Home" }));
    const session = await login(
      "https://x.example.com",
      { username: "u", password: "p" },
      fetchImpl,
    );
    expect(session.baseUrl).toBe("https://x.example.com");
  });

  it("throws badCredentials when bounced back to the login page", async () => {
    const fetchImpl: FetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res({ body: LOGIN_HTML }))
      .mockResolvedValueOnce(res({ status: 200, url: "https://x.example.com/common/login.aspx" }));
    await expect(
      login("https://x.example.com", { username: "u", password: "bad" }, fetchImpl),
    ).rejects.toMatchObject({ code: "badCredentials" });
  });

  it("throws loginPageFetchFailed when the login page is non-2xx", async () => {
    const fetchImpl: FetchImpl = vi.fn().mockResolvedValueOnce(res({ ok: false, status: 503 }));
    await expect(
      login("https://x.example.com", { username: "u", password: "p" }, fetchImpl),
    ).rejects.toBeInstanceOf(LoginError);
  });

  it("throws noNetwork when fetch rejects", async () => {
    const fetchImpl: FetchImpl = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(
      login("https://x.example.com", { username: "u", password: "p" }, fetchImpl),
    ).rejects.toMatchObject({ code: "noNetwork" });
  });
});
