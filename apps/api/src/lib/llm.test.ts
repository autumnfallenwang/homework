import { describe, expect, it } from "vitest";
import { chatCompletion, LlmError, listModels } from "./llm.js";

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url);
    seen.init = init;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

describe("llmgw client", () => {
  it("posts the request and reads tool calls and usage", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const result = await chatCompletion(
      { model: "claude-sonnet-5-5", messages: [{ role: "user", content: "hi" }] },
      {
        baseUrl: "http://gw/",
        fetchImpl: fakeFetch(
          200,
          {
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [{ function: { name: "record_grade", arguments: "{}" } }],
                },
              },
            ],
            usage: { prompt_tokens: 12, completion_tokens: 3 },
          },
          seen,
        ),
      },
    );
    expect(seen.url).toBe("http://gw/v1/chat/completions");
    expect(JSON.parse(String(seen.init?.body)).model).toBe("claude-sonnet-5-5");
    expect(result.toolCalls).toEqual([{ name: "record_grade", arguments: "{}" }]);
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 3 });
  });

  it("turns an llmgw error body into an LlmError with its code", async () => {
    const err = await chatCompletion(
      { model: "x", messages: [] },
      {
        baseUrl: "http://gw",
        fetchImpl: fakeFetch(400, { error: { message: "no such model", code: "model_not_found" } }),
      },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe("model_not_found");
    expect((err as LlmError).status).toBe(400);
  });

  it("reports a network failure as code network", async () => {
    const err = await chatCompletion(
      { model: "x", messages: [] },
      {
        baseUrl: "http://gw",
        fetchImpl: (async () => {
          throw new TypeError("fetch failed");
        }) as typeof fetch,
      },
    ).catch((e: unknown) => e);
    expect((err as LlmError).code).toBe("network");
  });

  it("lists models with whether they read images", async () => {
    const models = await listModels({
      baseUrl: "http://gw",
      fetchImpl: fakeFetch(200, {
        data: [
          {
            id: "claude-sonnet-5-5",
            owned_by: "anthropic",
            capability: "chat",
            input: ["text", "image"],
            status: "ok",
          },
          {
            id: "bge-m3:latest",
            owned_by: "ollama",
            capability: "embedding",
            input: ["text"],
            status: "ok",
          },
          {
            id: "gpt-6-sol",
            owned_by: "openai-codex",
            capability: "chat",
            input: ["text", "image"],
            status: "error",
          },
        ],
      }),
    });
    expect(models.map((m) => [m.id, m.readsImages, m.ok])).toEqual([
      ["claude-sonnet-5-5", true, true],
      ["bge-m3:latest", false, true],
      ["gpt-6-sol", true, false],
    ]);
  });
});
