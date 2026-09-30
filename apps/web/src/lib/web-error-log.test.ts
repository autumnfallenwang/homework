import { describe, expect, it } from "vitest";
import { webErrorLine } from "./web-error-log.js";

const when = new Date("2026-09-29T19:00:00.000Z");
const route = { routePath: "/history", routeType: "render" };

describe("the web's error line", () => {
  it("★ is ONE line of JSON in the house shape, with the level as a word", () => {
    const error = Object.assign(new Error("render broke"), { digest: "3173815633" });
    const line = webErrorLine(error, { path: "/history", method: "GET" }, route, when);
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toMatchObject({
      level: "error",
      time: "2026-09-29T19:00:00.000Z",
      service: "homework-web",
      event: "web.request_error",
      method: "GET",
      path: "/history",
      route: "/history",
      route_type: "render",
      digest: "3173815633",
      err: { type: "Error", message: "render broke" },
      msg: "request failed",
    });
  });

  it("★ drops the query string and never carries headers", () => {
    const line = webErrorLine(
      new Error("x"),
      {
        path: "/settings/children?password=secret",
        method: "GET",
        headers: { cookie: "session=abc" },
      } as never,
      route,
      when,
    );
    expect(line).not.toContain("secret");
    expect(line).not.toContain("session=abc");
    expect(JSON.parse(line).path).toBe("/settings/children");
  });

  it("copes with something thrown that is not an Error", () => {
    const parsed = JSON.parse(
      webErrorLine("plain string", { path: "/", method: "GET" }, route, when),
    );
    expect(parsed.err.message).toBe("plain string");
    expect(parsed).not.toHaveProperty("digest");
  });
});
