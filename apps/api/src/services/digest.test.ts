import {
  type AttentionConfig,
  type ChildRecord,
  type ClassDetails,
  DEFAULT_ATTENTION_CONFIG,
  type HomeworkRecord,
} from "@homework/shared";
import { describe, expect, it } from "vitest";
import { buildRefreshDigest, renderDigestEmail } from "./digest.js";

const NOW = new Date(2026, 3, 16); // April 16, 2026 (local)
const CFG: AttentionConfig = DEFAULT_ATTENTION_CONFIG;

function child(id: string, overrides: Partial<ChildRecord> = {}): ChildRecord {
  return {
    id,
    displayName: `Kid ${id}`,
    portalType: "teacherease",
    baseUrl: "https://x.example.com",
    username: "u@e.com",
    grade: null,
    school: null,
    homeworkUrl: "https://sites.google.com/hw",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function classWithMissing(className: string): ClassDetails {
  return {
    className,
    standards: [
      {
        name: "Standard A",
        score: "",
        scoreNumeric: 0,
        scoreLetter: "",
        isMeeting: false,
        children: [],
        missingCount: 1,
        lowScoreCount: 0,
        assignments: [
          {
            testNameId: 1,
            dueDate: "4/14",
            name: "Essay",
            weight: "",
            grade: "",
            gradeNumeric: 0,
            gradeLetter: "",
            isMissing: true,
            feedback: "",
          },
        ],
      },
    ],
    summary: { missingAssignments: 1 },
  };
}

function hw(subject: string, overrides: Partial<HomeworkRecord> = {}): HomeworkRecord {
  return {
    id: `hw-${subject}`,
    childId: "c1",
    hwDate: "2026-04-16",
    subject,
    content: "Read chapter 3",
    dueDate: "2026-04-17",
    dueDateInferred: false,
    scrapedAt: "2026-04-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildRefreshDigest", () => {
  it("rolls up family counts across children", () => {
    const c1 = child("c1");
    const c2 = child("c2");
    const digest = buildRefreshDigest({
      children: [c1, c2],
      perChildDetails: new Map([["c1", [classWithMissing("Math")]]]),
      perChildHomeworkForToday: new Map([["c1", [hw("Math")]]]),
      perChildHomeworkDueToday: new Map([["c1", [hw("Science")]]]),
      perChildHeroCounts: new Map([
        ["c1", { meetingCount: 3, notAssessedCount: 1 }],
        ["c2", { meetingCount: 2, notAssessedCount: 0 }],
      ]),
      cfg: CFG,
      now: NOW,
    });

    expect(digest.family.childCount).toBe(2);
    expect(digest.family.attentionCount).toBe(1); // Math flagged on c1
    expect(digest.family.meetingCount).toBe(5);
    expect(digest.family.homeworkForTodayCount).toBe(1);
    expect(digest.family.homeworkDueTodayCount).toBe(1);
    expect(digest.todayLocal).toBe("2026-04-16");
  });

  it("gives a never-fetched child a zeroed hero and no attention", () => {
    const c = child("c1");
    const digest = buildRefreshDigest({
      children: [c],
      perChildDetails: new Map(),
      perChildHomeworkForToday: new Map(),
      perChildHomeworkDueToday: new Map(),
      perChildHeroCounts: new Map(),
      cfg: CFG,
      now: NOW,
    });
    expect(digest.children[0]?.hero.attentionCount).toBe(0);
    expect(digest.children[0]?.attention).toHaveLength(0);
  });
});

describe("renderDigestEmail", () => {
  it("produces subject, text, and html", () => {
    const c = child("c1");
    const digest = buildRefreshDigest({
      children: [c],
      perChildDetails: new Map([["c1", [classWithMissing("Math")]]]),
      perChildHomeworkForToday: new Map([["c1", [hw("Math")]]]),
      perChildHomeworkDueToday: new Map(),
      perChildHeroCounts: new Map([["c1", { meetingCount: 2, notAssessedCount: 0 }]]),
      cfg: CFG,
      now: NOW,
    });
    const rendered = renderDigestEmail(digest);

    expect(rendered.subject).toContain("need attention");
    expect(rendered.htmlBody).toContain("<html>");
    expect(rendered.htmlBody).toContain("Essay");
    expect(rendered.textBody).toContain("Needs attention");
    expect(rendered.textBody).toContain("Essay");
  });

  it("says all caught up when nothing needs attention", () => {
    const c = child("c1");
    const digest = buildRefreshDigest({
      children: [c],
      perChildDetails: new Map(),
      perChildHomeworkForToday: new Map(),
      perChildHomeworkDueToday: new Map(),
      perChildHeroCounts: new Map([["c1", { meetingCount: 4, notAssessedCount: 0 }]]),
      cfg: CFG,
      now: NOW,
    });
    expect(renderDigestEmail(digest).subject).toContain("All caught up");
  });
});
