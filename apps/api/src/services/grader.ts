// One grade, start to finish, without the database (ADR 0014): ask the model,
// read its answer back, retry once on an unreadable answer, then try the fallback
// model. The sweep (services/grading.ts) stores what this returns; the Phase 0
// dry run (scripts/grade-dry-run.ts) prints it.

import { GRADING_LIMITS, type GradeFinding, gradePhotoLabel } from "@homework/shared";
import { z } from "zod";
import { type ChatRequest, type ChatResult, chatCompletion, LlmError } from "../lib/llm.js";
import {
  buildGradingMessages,
  GRADE_TOOL_NAME,
  type GradingInput,
  type GradingPhoto,
  photoTags,
} from "./grading-prompt.js";

export interface GradeOutcome {
  status: "graded" | "retake" | "not_gradable" | "failed";
  score: number | null;
  summary: string | null;
  findings: GradeFinding[];
  stuck: boolean;
  retakeReason: string | null;
  retakePhotoIds: string[];
  sheetTitle: string | null;
  /** The model whose answer this is (the last one tried, when failed). */
  model: string | null;
  /** The photos the model saw. */
  photoIds: string[];
  durationMs: number;
  usage: { promptTokens: number; completionTokens: number } | null;
  error: string | null;
}

export interface GraderDeps {
  chat?: (req: ChatRequest) => Promise<ChatResult>;
  now?: () => number;
}

const FALLBACK_RETAKE_REASON =
  "Some photos are hard to read. Please take them again in good light, then Submit.";

const rawGradeSchema = z.object({
  status: z.enum(["graded", "retake", "not_gradable"]),
  score: z.number().min(0).max(100).nullable().optional(),
  summary: z.string().nullable().optional(),
  findings: z
    .array(
      z.object({
        photo: z.string().nullable().optional(),
        question: z.union([z.string(), z.number()]).nullable().optional(),
        problem: z.string().min(1),
        fix: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  stuck: z.boolean().nullable().optional(),
  retake_reason: z.string().nullable().optional(),
  retake_photos: z.array(z.string()).nullable().optional(),
  sheet_title: z.string().nullable().optional(),
});
type RawGrade = z.infer<typeof rawGradeSchema>;

/** Why an answer couldn't be used — worth one more try. */
class BadAnswer extends Error {}

function text(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

/** "solution-2", "Solution photo 2", "solution 2" → "solution-2". */
function normalizeTag(raw: string): string | null {
  const m = /(sheet|solution)[\s_-]*(?:photo[\s_-]*)?#?(\d+)/i.exec(raw);
  return m ? `${m[1]?.toLowerCase()}-${Number(m[2])}` : null;
}

/** The JSON the model gave: its tool call, or (some models) a JSON object in the text. */
function answerJson(result: ChatResult): unknown {
  const call = result.toolCalls.find((t) => t.name === GRADE_TOOL_NAME) ?? result.toolCalls[0];
  const raw = call?.arguments ?? extractJsonObject(result.content ?? "");
  if (!raw) throw new BadAnswer("the model did not record a grade");
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadAnswer("the model's grade was not JSON");
  }
}

function extractJsonObject(content: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  const body = fenced?.[1] ?? content;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : null;
}

/** Read a model answer into an outcome (minus timing/usage), or throw BadAnswer. */
export function readGradeAnswer(
  result: ChatResult,
  photos: readonly GradingPhoto[],
): Omit<GradeOutcome, "durationMs" | "usage" | "model" | "photoIds" | "error"> {
  const parsed = rawGradeSchema.safeParse(answerJson(result));
  if (!parsed.success) throw new BadAnswer("the model's grade did not fit the format");
  const raw: RawGrade = parsed.data;
  const tags = photoTags(photos);
  const labels = new Map<string, string>();
  const counts = { sheet: 0, solution: 0 };
  for (const p of photos) {
    labels.set(p.id, gradePhotoLabel(p.kind, counts[p.kind]));
    counts[p.kind] += 1;
  }
  const photoOf = (raw: string | null | undefined): GradingPhoto | null => {
    const tag = raw ? normalizeTag(raw) : null;
    return tag ? (tags.get(tag) ?? null) : null;
  };

  const findings: GradeFinding[] = (raw.findings ?? [])
    .slice(0, GRADING_LIMITS.findingsMax)
    .map((f) => {
      const photo = photoOf(f.photo);
      return {
        photoId: photo?.id ?? null,
        photoLabel: photo ? (labels.get(photo.id) ?? null) : null,
        question: f.question === null || f.question === undefined ? null : String(f.question),
        problem: f.problem.trim(),
        fix: text(f.fix),
      };
    });

  const base = {
    summary: text(raw.summary),
    findings,
    stuck: raw.stuck ?? false,
    sheetTitle: text(raw.sheet_title),
  };
  // A retake request can come with any status (ADR 0014): a graded submission may
  // still have photos she should take again.
  const retakeIds = [
    ...new Set(
      (raw.retake_photos ?? [])
        .map((t) => photoOf(t)?.id)
        .filter((id): id is string => id !== undefined),
    ),
  ];
  const reason = text(raw.retake_reason);
  const retake =
    raw.status === "retake"
      ? { retakeReason: reason ?? FALLBACK_RETAKE_REASON, retakePhotoIds: retakeIds }
      : reason
        ? { retakeReason: reason, retakePhotoIds: retakeIds }
        : { retakeReason: null, retakePhotoIds: [] };
  if (raw.status === "graded") {
    if (raw.score === null || raw.score === undefined) {
      throw new BadAnswer("the model graded without a score");
    }
    return { ...base, ...retake, status: "graded", score: Math.round(raw.score) };
  }
  if (raw.status === "retake") return { ...base, ...retake, status: "retake", score: null };
  return { ...base, ...retake, status: "not_gradable", score: null };
}

/** Nothing for a model to look at. */
function noPhotosOutcome(input: GradingInput): GradeOutcome {
  return {
    status: "not_gradable",
    score: null,
    summary: "No photos — nothing to check.",
    findings: [],
    stuck: false,
    retakeReason: null,
    retakePhotoIds: [],
    sheetTitle: null,
    model: null,
    photoIds: input.photos.map((p) => p.id),
    durationMs: 0,
    usage: null,
    error: null,
  };
}

/**
 * Grade one submission: the model, one more try on an unreadable answer, then the
 * fallback model the same way. Never throws: a grade that couldn't be made comes
 * back `failed` with the last error.
 */
export async function gradeSubmission(
  input: GradingInput,
  models: { model: string; fallbackModel: string },
  deps: GraderDeps = {},
): Promise<GradeOutcome> {
  if (input.photos.length === 0) return noPhotosOutcome(input);
  const chat = deps.chat ?? ((req: ChatRequest) => chatCompletion(req));
  const now = deps.now ?? Date.now;
  const started = now();
  const { messages, tools } = buildGradingMessages(input);
  const tried = [...new Set([models.model, models.fallbackModel].map((m) => m.trim()))].filter(
    Boolean,
  );
  let lastError = "no model configured";
  let lastModel: string | null = null;

  for (const model of tried) {
    lastModel = model;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const result = await chat({
          model,
          messages,
          tools,
          tool_choice: { type: "function", function: { name: GRADE_TOOL_NAME } },
        });
        const answer = readGradeAnswer(result, input.photos);
        return {
          ...answer,
          model,
          photoIds: input.photos.map((p) => p.id),
          durationMs: now() - started,
          usage: result.usage,
          error: null,
        };
      } catch (err) {
        if (err instanceof BadAnswer) {
          lastError = `${model}: ${err.message}`;
          continue; // one more try with the same model
        }
        lastError =
          err instanceof LlmError
            ? `${model}: ${err.code}${err.status ? ` (${err.status})` : ""}: ${err.message}`
            : `${model}: ${err instanceof Error ? err.message : String(err)}`;
        break; // llmgw refused or failed: on to the fallback model
      }
    }
  }
  return {
    status: "failed",
    score: null,
    summary: null,
    findings: [],
    stuck: false,
    retakeReason: null,
    retakePhotoIds: [],
    sheetTitle: null,
    model: lastModel,
    photoIds: input.photos.map((p) => p.id),
    durationMs: now() - started,
    usage: null,
    error: lastError.slice(0, 500),
  };
}
