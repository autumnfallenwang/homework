// What the grader is asked (ADR 0014). Kept apart from the plumbing so a prompt
// change is one reviewed diff — bump GRADING_PROMPT_VERSION with it; every grade
// row stores the version it was made with.

import { GRADING_LIMITS, HOMEWORK_KIND_LABELS, type HomeworkKind } from "@homework/shared";
import type { ChatMessage, ChatTool, ContentPart } from "../lib/llm.js";

export const GRADING_PROMPT_VERSION = 2;

export const GRADE_TOOL_NAME = "record_grade";

/** One photo the model sees, in the order her pages show them (sheet, then solution). */
export interface GradingPhoto {
  id: string;
  kind: "sheet" | "solution";
  contentType: string;
  bytes: Buffer;
}

/** Everything one grade looks at. */
export interface GradingInput {
  itemId: string;
  /** For the alert email only — the model never gets her name. */
  childId: string;
  childName: string;
  /** The child profile's school grade, when the parent set one. */
  schoolGrade: string | null;
  className: string;
  kind: HomeworkKind;
  title: string;
  details: string | null;
  assignedOn: string;
  dueOn: string;
  submittedAt: Date;
  note: string | null;
  photos: GradingPhoto[];
  /** The parent's extra words (Settings → Grading). */
  instructions: string;
}

/** `sheet-1`, `solution-3`: how the prompt and the model name a photo. */
export function photoTag(kind: "sheet" | "solution", index: number): string {
  return `${kind}-${index + 1}`;
}

/** Tag → the photo it names, for reading the model's answer back. */
export function photoTags(photos: readonly GradingPhoto[]): Map<string, GradingPhoto> {
  const tags = new Map<string, GradingPhoto>();
  const counts = { sheet: 0, solution: 0 };
  for (const p of photos) {
    tags.set(photoTag(p.kind, counts[p.kind]), p);
    counts[p.kind] += 1;
  }
  return tags;
}

const SYSTEM_PROMPT = `You grade a middle-school student's homework for her parent. You get what she typed about one assignment and photos: photos of the homework sheet (tagged sheet-N, if she took any) and photos of her finished work (tagged solution-N). Worksheets usually show the printed questions next to her handwritten answers. She often photographs one page in parts, so neighbouring photos overlap: look at all of them together before deciding anything is missing.

Record the result with the ${GRADE_TOOL_NAME} tool, deciding in this order.

1. Status.
   - "not_gradable": there are no photos of her work to look at (work done on a computer, only a note).
   - "retake": almost nothing can be checked — the photos are too blurry, dark or washed out, or show too little of the work, to grade any of it.
   - "graded": everything else, even when some parts can't be read. Grade what you can see.
2. Score (graded only), 0-100, for the parts you could check:
   - 90-100: everything right and complete.
   - 80-89: small slips only.
   - 60-79: several errors, or a part left undone.
   - below 60: a misconception that runs through the work, or much of it missing.
   Correctness counts most: check every answer you can by working it out yourself (math: redo the computation; graphs: check the plotted points). Then completeness: questions she left blank count against the score; questions you can't see (cut off, unreadable) do not — they go in the retake request instead. For writing, notes and annotations, judge whether it was done fully and thoughtfully for her grade level, not polish.
3. Retake request (any status): only for what you could not check — her answer to a question can't be read in ANY of the photos (cut off, blurry, too faint or washed out), the numbers or text needed to check an answer are cut off in every photo, or a page of her work is clearly missing (page numbers jump, a packet stops halfway, her note mentions pages that aren't shown). Then list those photo tags in retake_photos and write retake_reason TO HER: one or two short, kind sentences about taking the photo again (which photo, what is wrong with it, how to retake it — the whole page in the frame, good light, camera steady, closer). The request is about the PHOTO only: never ask her to redo, darken, rewrite or change her work, and never mention whether her answers are right, mistakes or a score. No retake for a photo that is tilted or imperfect but readable, for a cut-off heading when the answers can still be checked, or for a part that shows in another photo. Otherwise retake_reason is null and retake_photos is empty.

Rules:
- Never invent questions or answers you can't see. If you are unsure an answer is wrong, say "possibly" and take little off.
- findings: real problems only, the most important first, at most ${GRADING_LIMITS.findingsMax}. Each names the photo tag it is on, the question as printed ("3", "2b"), what is wrong (problem) and what right looks like (fix, short). These go to the parent, never to her. Correct work needs no finding.
- stuck: true when her note or blank pages show she couldn't do part of it.
- summary: one or two sentences for the parent: what the assignment is, how it went, the main issue, and what couldn't be checked.
- sheet_title: the assignment's title as printed at the top of the sheet or document, word for word, if you can read one; else null.
- score is null unless the status is "graded".
- Write in English.`;

const GRADE_TOOL: ChatTool = {
  type: "function",
  function: {
    name: GRADE_TOOL_NAME,
    description: "Record the grade of one homework submission.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["graded", "retake", "not_gradable"] },
        score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
        summary: { type: "string" },
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              photo: { type: ["string", "null"], description: "Photo tag, e.g. solution-2" },
              question: { type: ["string", "null"] },
              problem: { type: "string" },
              fix: { type: ["string", "null"] },
            },
            required: ["photo", "question", "problem", "fix"],
          },
        },
        stuck: { type: "boolean" },
        retake_reason: { type: ["string", "null"] },
        retake_photos: { type: "array", items: { type: "string" } },
        sheet_title: { type: ["string", "null"] },
      },
      required: [
        "status",
        "score",
        "summary",
        "findings",
        "stuck",
        "retake_reason",
        "retake_photos",
        "sheet_title",
      ],
    },
  },
};

function describe(input: GradingInput): string {
  const lines = [
    input.schoolGrade ? `School grade: ${input.schoolGrade}` : null,
    `Class: ${input.className}`,
    `Type: ${HOMEWORK_KIND_LABELS[input.kind]}`,
    `What she called it: ${input.title}`,
    input.details ? `Details she wrote: ${input.details}` : null,
    `Given on ${input.assignedOn}, due ${input.dueOn}`,
    `Her note about the finished work: ${input.note ?? "(none)"}`,
    input.instructions.trim()
      ? `The parent's instructions for grading: ${input.instructions}`
      : null,
    input.photos.length === 0
      ? "There are no photos."
      : `Photos: ${[...photoTags(input.photos).keys()].join(", ")}`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

/** The chat request for one grade (the model is filled in by the caller). */
export function buildGradingMessages(input: GradingInput): {
  messages: ChatMessage[];
  tools: ChatTool[];
} {
  const content: ContentPart[] = [{ type: "text", text: describe(input) }];
  for (const [tag, photo] of photoTags(input.photos)) {
    content.push({ type: "text", text: `${tag}:` });
    content.push({
      type: "image_url",
      image_url: { url: `data:${photo.contentType};base64,${photo.bytes.toString("base64")}` },
    });
  }
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    tools: [GRADE_TOOL],
  };
}
