// Per-child hero data loader. Shared by the Today-tab StatusHero render.
// Queries (via api.ts): getLatestSuccessfulFetchRun, getGradesForFetchRun,
// getAllClassDetails, getHomeworkForDay. Pure per-child aggregation around
// those calls — caller owns `now` + `cfg` for testability. Ported from the
// desktop app; ids are uuid strings and `computeChildAttention` comes from
// @homework/shared.

import { type AttentionConfig, type ClassDetails, computeChildAttention } from "@homework/shared";
import {
  getAllClassDetails,
  getChildHomeworkItems,
  getGradesForFetchRun,
  getHomeworkForDay,
  getLatestSuccessfulFetchRun,
} from "./api.js";
import { toLocalIso } from "./local-date.js";

export interface ChildHeroCounts {
  readonly meetingCount: number;
  readonly notAssessedCount: number;
}

export interface ChildStatus {
  childId: string;
  name: string;
  meetingCount: number;
  attentionCount: number;
  notAssessedCount: number;
  attentionClassNames: string[];
  homeworkConfigured: boolean;
  homeworkForTodayCount: number;
  homeworkDueTodayCount: number;
}

export interface HeroLoadResult {
  readonly statuses: ChildStatus[];
  readonly perChildDetails: Map<string, ClassDetails[]>;
  readonly perChildHeroCounts: Map<string, ChildHeroCounts>;
}

export async function loadHeroStatuses(
  children: ReadonlyArray<{
    id: string;
    displayName: string;
    homeworkUrl: string | null;
    homeworkSource: "page" | "child";
  }>,
  cfg: AttentionConfig,
  now: Date,
): Promise<HeroLoadResult> {
  const todayIso = toLocalIso(now);
  const statuses: ChildStatus[] = [];
  const perChildDetails = new Map<string, ClassDetails[]>();
  const perChildHeroCounts = new Map<string, ChildHeroCounts>();

  for (const child of children) {
    // A child who enters their own homework (ADR 0006) is counted from their items.
    const enteredByChild = child.homeworkSource === "child";
    const homeworkConfigured = Boolean(child.homeworkUrl) || enteredByChild;
    let homeworkForTodayCount = 0;
    let homeworkDueTodayCount = 0;
    if (enteredByChild) {
      const { items } = await getChildHomeworkItems(child.id);
      homeworkForTodayCount = items.filter((i) => i.assignedOn === todayIso).length;
      homeworkDueTodayCount = items.filter((i) => i.dueOn === todayIso).length;
    } else if (homeworkConfigured) {
      const hwRows = await getHomeworkForDay(child.id, todayIso);
      homeworkForTodayCount = hwRows.filter((r) => r.hwDate === todayIso).length;
      homeworkDueTodayCount = hwRows.filter((r) => r.dueDate === todayIso).length;
    }

    const run = await getLatestSuccessfulFetchRun(child.id, "teacherease");
    if (!run) {
      statuses.push({
        childId: child.id,
        name: child.displayName,
        meetingCount: 0,
        attentionCount: 0,
        notAssessedCount: 0,
        attentionClassNames: [],
        homeworkConfigured,
        homeworkForTodayCount,
        homeworkDueTodayCount,
      });
      perChildDetails.set(child.id, []);
      perChildHeroCounts.set(child.id, { meetingCount: 0, notAssessedCount: 0 });
      continue;
    }

    const [g, cd] = await Promise.all([getGradesForFetchRun(run.id), getAllClassDetails(run.id)]);
    const engine = computeChildAttention(cd, now, cfg);
    const attnClasses = engine.perClass
      .filter((c) => c.classFlag.status === "attention")
      .map((c) => c.className);
    const attnSet = new Set(attnClasses);
    const meetingCount = g.filter(
      (gr) => gr.status === "meeting" && !attnSet.has(gr.className),
    ).length;
    const notAssessedCount = g.filter(
      (gr) => gr.status === "not_assessed" && !attnSet.has(gr.className),
    ).length;

    statuses.push({
      childId: child.id,
      name: child.displayName,
      meetingCount,
      attentionCount: attnClasses.length,
      notAssessedCount,
      attentionClassNames: attnClasses,
      homeworkConfigured,
      homeworkForTodayCount,
      homeworkDueTodayCount,
    });
    perChildDetails.set(child.id, cd);
    perChildHeroCounts.set(child.id, { meetingCount, notAssessedCount });
  }

  return { statuses, perChildDetails, perChildHeroCounts };
}
