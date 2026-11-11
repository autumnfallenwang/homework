import { describe, expect, it } from "vitest";
import type { ChatRequest, ChatResult } from "../lib/llm.js";
import { LlmError } from "../lib/llm.js";
import { gradeSubmission, readGradeAnswer } from "./grader.js";
import { buildGradingMessages, type GradingInput, type GradingPhoto } from "./grading-prompt.js";

const photo = (id: string, kind: "sheet" | "solution"): GradingPhoto => ({
  id,
  kind,
  contentType: "image/jpeg",
  bytes: Buffer.from([0xff, 0xd8, 0xff]),
});
const photos = [photo("s1", "sheet"), photo("w1", "solution"), photo("w2", "solution")];

function input(over: Partial<GradingInput> = {}): GradingInput {
  return {
    itemId: "item",
    childId: "child",
    childName: "Ivy",
    schoolGrade: null,
    className: "Mathematics 8 Honors",
    kind: "homework",
    title: "packet",
    details: null,
    assignedOn: "2026-10-26",
    dueOn: "2026-11-02",
    submittedAt: new Date("2026-11-01T20:00:00Z"),
    note: "IDK how to do the last page",
    photos,
    instructions: "",
    ...over,
  };
}

const answer = (args: Record<string, unknown>, model = "m"): ChatResult => ({
  model,
  content: null,
  toolCalls: [{ name: "record_grade", arguments: JSON.stringify(args) }],
  usage: { promptTokens: 100, completionTokens: 10 },
});

const graded = {
  status: "graded",
  score: 58.4,
  summary: "Reflections packet.",
  findings: [
    { photo: "solution-2", question: 15, problem: "Negated both coordinates", fix: "Swap x and y" },
    { photo: "Solution photo 1", question: "1c", problem: "Order of operations", fix: null },
    { photo: "nowhere-9", question: null, problem: "Something", fix: "" },
  ],
  stuck: true,
  retake_reason: null,
  retake_photos: [],
  sheet_title: "  Unit 3 Review  ",
};

describe("buildGradingMessages", () => {
  it("describes the item and labels each photo before it, sheet first", () => {
    const { messages, tools } = buildGradingMessages(input({ instructions: "8th grade" }));
    expect(tools[0]?.function.name).toBe("record_grade");
    const user = messages[1]?.content;
    if (!Array.isArray(user)) throw new Error("expected parts");
    const text = user[0]?.type === "text" ? user[0].text : "";
    expect(text).toContain("Class: Mathematics 8 Honors");
    expect(text).toContain("Her note about the finished work: IDK how to do the last page");
    expect(text).toContain("The parent's instructions for grading: 8th grade");
    expect(text).not.toContain("Ivy");
    expect(
      user.filter((p) => p.type === "text").map((p) => (p.type === "text" ? p.text : "")),
    ).toEqual([text, "sheet-1:", "solution-1:", "solution-2:"]);
    expect(user.filter((p) => p.type === "image_url")).toHaveLength(3);
  });
});

describe("readGradeAnswer", () => {
  it("reads a graded answer, rounding the score and mapping photo tags to photos", () => {
    const out = readGradeAnswer(answer(graded), photos);
    expect(out.status).toBe("graded");
    expect(out.score).toBe(58);
    expect(out.stuck).toBe(true);
    expect(out.sheetTitle).toBe("Unit 3 Review");
    expect(out.findings).toEqual([
      {
        photoId: "w2",
        photoLabel: "Solution photo 2",
        question: "15",
        problem: "Negated both coordinates",
        fix: "Swap x and y",
      },
      {
        photoId: "w1",
        photoLabel: "Solution photo 1",
        question: "1c",
        problem: "Order of operations",
        fix: null,
      },
      { photoId: null, photoLabel: null, question: null, problem: "Something", fix: null },
    ]);
  });

  it("keeps a retake request that comes with a score", () => {
    const out = readGradeAnswer(
      answer({
        ...graded,
        retake_reason: "Photo 2 cuts off the top.",
        retake_photos: ["solution-2", "sheet 1", "x"],
      }),
      photos,
    );
    expect(out.status).toBe("graded");
    expect(out.retakeReason).toBe("Photo 2 cuts off the top.");
    expect(out.retakePhotoIds).toEqual(["w2", "s1"]);
  });

  it("gives a retake a reason even when the model left it out", () => {
    const out = readGradeAnswer(
      answer({ status: "retake", score: null, retake_photos: ["solution-1"] }),
      photos,
    );
    expect(out.status).toBe("retake");
    expect(out.score).toBeNull();
    expect(out.retakeReason).toMatch(/take them again/);
  });

  it("reads JSON from the text when a model answers without the tool", () => {
    const out = readGradeAnswer(
      {
        model: "m",
        content: 'Here:\n```json\n{"status":"not_gradable","score":null}\n```',
        toolCalls: [],
        usage: null,
      },
      photos,
    );
    expect(out.status).toBe("not_gradable");
  });

  it("refuses a graded answer without a score, or no answer at all", () => {
    expect(() => readGradeAnswer(answer({ status: "graded", score: null }), photos)).toThrow(
      /without a score/,
    );
    expect(() =>
      readGradeAnswer(
        { model: "m", content: "I think it's fine", toolCalls: [], usage: null },
        photos,
      ),
    ).toThrow();
  });
});

describe("gradeSubmission", () => {
  it("doesn't call a model when there are no photos", async () => {
    let calls = 0;
    const out = await gradeSubmission(
      input({ photos: [] }),
      { model: "a", fallbackModel: "b" },
      {
        chat: async () => {
          calls += 1;
          throw new Error("unexpected");
        },
      },
    );
    expect(out.status).toBe("not_gradable");
    expect(calls).toBe(0);
  });

  it("tries once more on an unreadable answer, then the fallback model on an llmgw error", async () => {
    const asked: string[] = [];
    const replies: Array<(req: ChatRequest) => ChatResult> = [
      (req) => ({ model: req.model, content: "no tool", toolCalls: [], usage: null }),
      () => {
        throw new LlmError(429, "rate_limited", "usage window used up");
      },
      (req) => answer(graded, req.model),
    ];
    const out = await gradeSubmission(
      input(),
      { model: "primary", fallbackModel: "backup" },
      {
        chat: async (req) => {
          asked.push(req.model);
          const reply = replies.shift();
          if (!reply) throw new Error("too many calls");
          return reply(req);
        },
      },
    );
    expect(asked).toEqual(["primary", "primary", "backup"]);
    expect(out.status).toBe("graded");
    expect(out.model).toBe("backup");
    expect(out.photoIds).toEqual(["s1", "w1", "w2"]);
  });

  it("comes back failed with the last error when every model fails", async () => {
    const out = await gradeSubmission(
      input(),
      { model: "primary", fallbackModel: "" },
      {
        chat: async () => {
          throw new LlmError(null, "timeout", "llmgw did not answer in time");
        },
      },
    );
    expect(out.status).toBe("failed");
    expect(out.error).toBe("primary: timeout: llmgw did not answer in time");
  });
});
