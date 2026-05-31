import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiBaseUrl, getChildren } from "./api.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("apiBaseUrl", () => {
  it("falls back to the local dev API port", () => {
    expect(apiBaseUrl()).toBe("http://localhost:3001");
  });
});

describe("request", () => {
  it("returns parsed JSON on a 2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ id: "x" }]), { status: 200 })),
    );
    const children = await getChildren();
    expect(children).toEqual([{ id: "x" }]);
  });

  it("throws ApiClientError on a non-2xx with the typed body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Not found" }), { status: 404 })),
    );
    await expect(getChildren()).rejects.toMatchObject({
      name: "ApiClientError",
      status: 404,
    });
  });

  it("ApiClientError carries the status and body", () => {
    const err = new ApiClientError(400, { error: "Validation failed" });
    expect(err.status).toBe(400);
    expect(err.message).toBe("Validation failed");
  });
});
