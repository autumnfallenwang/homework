// The llmgw client (ADR 0014). llmgw is the home cluster's OpenAI-compatible
// gateway (`../llm-gateway`): Claude through the family's Claude subscription,
// GPT through the ChatGPT login, local Ollama models. Plain fetch + Zod — the
// two calls we need (chat completions with tools and images, the model list)
// don't justify an SDK.

import { z } from "zod";
import { config } from "../config.js";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatTool[];
  tool_choice?: "auto" | "required" | { type: "function"; function: { name: string } };
  temperature?: number;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatResult {
  /** The model that answered (as the request named it). */
  model: string;
  content: string | null;
  toolCalls: { name: string; arguments: string }[];
  usage: ChatUsage | null;
}

/** A refused or failed call; `code` is llmgw's error code, or `timeout` / `network`. */
export class LlmError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface LlmOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const completionSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .nullable()
            .optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({ prompt_tokens: z.number(), completion_tokens: z.number() })
    .nullable()
    .optional(),
});

const modelListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      owned_by: z.string().optional(),
      capability: z.string().optional(),
      input: z.array(z.string()).optional(),
      status: z.string().optional(),
    }),
  ),
});

export interface LlmModel {
  id: string;
  ownedBy: string;
  capability: string | null;
  readsImages: boolean;
  /** llmgw's last validation said it answers. */
  ok: boolean;
}

function baseUrlOf(opts: LlmOptions): string {
  return (opts.baseUrl ?? config.llmGatewayUrl).replace(/\/+$/, "");
}

async function call(path: string, init: RequestInit, opts: LlmOptions): Promise<unknown> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${baseUrlOf(opts)}${path}`, {
      ...init,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new LlmError(null, "timeout", "llmgw did not answer in time");
    }
    throw new LlmError(null, "network", err instanceof Error ? err.message : String(err));
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as { error?: { message?: string; code?: string; type?: string } } | null)
      ?.error;
    throw new LlmError(
      res.status,
      error?.code ?? error?.type ?? `http_${res.status}`,
      error?.message ?? `llmgw answered ${res.status}`,
    );
  }
  return body;
}

/** One chat completion. Throws `LlmError` on any failure. */
export async function chatCompletion(req: ChatRequest, opts: LlmOptions = {}): Promise<ChatResult> {
  const body = await call(
    "/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    },
    opts,
  );
  const parsed = completionSchema.safeParse(body);
  if (!parsed.success) throw new LlmError(null, "bad_response", "llmgw's answer had no choices");
  const message = parsed.data.choices[0]?.message;
  const usage = parsed.data.usage;
  return {
    model: req.model,
    content: message?.content ?? null,
    toolCalls: (message?.tool_calls ?? []).map((t) => ({
      name: t.function.name,
      arguments: t.function.arguments,
    })),
    usage: usage
      ? { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens }
      : null,
  };
}

/** Every model llmgw lists. */
export async function listModels(opts: LlmOptions = {}): Promise<LlmModel[]> {
  const body = await call("/v1/models", { method: "GET" }, { timeoutMs: 10_000, ...opts });
  const parsed = modelListSchema.safeParse(body);
  if (!parsed.success)
    throw new LlmError(null, "bad_response", "llmgw's model list was unreadable");
  return parsed.data.data.map((m) => ({
    id: m.id,
    ownedBy: m.owned_by ?? "",
    capability: m.capability ?? null,
    readsImages: (m.input ?? []).includes("image"),
    ok: m.status === undefined || m.status === "ok",
  }));
}
