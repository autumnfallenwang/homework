// Daily digest: build a RefreshDigest from the DB and render it to a
// text+HTML email. Ported from the desktop app's src/lib/notify/{digest,
// build-from-db,email-templates,os-channel}.ts. The desktop rendered via its
// i18n layer; here the strings are inlined in English (single-family LAN port).
// The attention engine + missing-first sort come from @homework/shared.

import {
  type AttentionConfig,
  type AttentionItem,
  type ChildRecord,
  type ClassDetails,
  computeChildAttention,
  type HomeworkRecord,
  sortItemsMissingFirst,
} from "@homework/shared";
import type { Database } from "../db/index.js";
import {
  getAllClassDetails,
  getAttentionConfig,
  getChildren,
  getGradesForFetchRun,
  getHomeworkDueOnDay,
  getHomeworkForDay,
  getLatestSuccessfulFetchRun,
} from "../db/queries.js";

// --- Types (digest subset of the desktop notify/types.ts) -----------------

export interface ChildDigestHero {
  readonly attentionCount: number;
  readonly attentionClassNames: string[];
  readonly meetingCount: number;
  readonly notAssessedCount: number;
}

export interface ChildDigest {
  readonly childId: string;
  readonly childName: string;
  readonly hero: ChildDigestHero;
  readonly attention: AttentionItem[];
  readonly homeworkConfigured: boolean;
  readonly homeworkForToday: HomeworkRecord[];
  readonly homeworkDueToday: HomeworkRecord[];
}

export interface FamilyHero {
  readonly childCount: number;
  readonly attentionCount: number;
  readonly meetingCount: number;
  readonly notAssessedCount: number;
  readonly homeworkForTodayCount: number;
  readonly homeworkDueTodayCount: number;
}

export interface RefreshDigest {
  readonly type: "refreshDigest";
  readonly generatedAt: number;
  readonly todayLocal: string;
  readonly family: FamilyHero;
  readonly children: ChildDigest[];
}

export interface ChildHeroCounts {
  readonly meetingCount: number;
  readonly notAssessedCount: number;
}

export interface BuildRefreshDigestInput {
  readonly children: readonly ChildRecord[];
  readonly perChildDetails: ReadonlyMap<string, readonly ClassDetails[]>;
  readonly perChildHomeworkForToday: ReadonlyMap<string, readonly HomeworkRecord[]>;
  readonly perChildHomeworkDueToday: ReadonlyMap<string, readonly HomeworkRecord[]>;
  readonly perChildHeroCounts: ReadonlyMap<string, ChildHeroCounts>;
  readonly cfg: AttentionConfig;
  readonly now: Date;
}

/** Local-timezone ISO date (YYYY-MM-DD). Never toISOString() — that's UTC. */
export function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// --- Build (pure) — ported verbatim from desktop digest.ts ----------------

export function buildRefreshDigest(input: BuildRefreshDigestInput): RefreshDigest {
  const {
    children,
    perChildDetails,
    perChildHomeworkForToday,
    perChildHomeworkDueToday,
    perChildHeroCounts,
    cfg,
    now,
  } = input;

  const todayLocal = toLocalIso(now);

  const childDigests: ChildDigest[] = children.map((child) => {
    const homeworkConfigured = Boolean(child.homeworkUrl);
    const homeworkForToday = [...(perChildHomeworkForToday.get(child.id) ?? [])];
    const homeworkDueToday = [...(perChildHomeworkDueToday.get(child.id) ?? [])];
    const details = perChildDetails.get(child.id) ?? [];
    const eng = computeChildAttention(details, now, cfg);
    const attentionClassNames = eng.perClass
      .filter((c) => c.classFlag.status === "attention")
      .map((c) => c.className);
    const counts = perChildHeroCounts.get(child.id) ?? { meetingCount: 0, notAssessedCount: 0 };

    const hero: ChildDigestHero = {
      attentionCount: attentionClassNames.length,
      attentionClassNames,
      meetingCount: counts.meetingCount,
      notAssessedCount: counts.notAssessedCount,
    };

    const attention = sortItemsMissingFirst(eng.withinWindow);

    return {
      childId: child.id,
      childName: child.displayName,
      hero,
      attention,
      homeworkConfigured,
      homeworkForToday,
      homeworkDueToday,
    };
  });

  return {
    type: "refreshDigest",
    generatedAt: now.getTime(),
    todayLocal,
    family: rollUpFamily(childDigests),
    children: childDigests,
  };
}

function rollUpFamily(children: readonly ChildDigest[]): FamilyHero {
  let attentionCount = 0;
  let meetingCount = 0;
  let notAssessedCount = 0;
  let homeworkForTodayCount = 0;
  let homeworkDueTodayCount = 0;
  for (const c of children) {
    attentionCount += c.hero.attentionCount;
    meetingCount += c.hero.meetingCount;
    notAssessedCount += c.hero.notAssessedCount;
    homeworkForTodayCount += c.homeworkForToday.length;
    homeworkDueTodayCount += c.homeworkDueToday.length;
  }
  return {
    childCount: children.length,
    attentionCount,
    meetingCount,
    notAssessedCount,
    homeworkForTodayCount,
    homeworkDueTodayCount,
  };
}

// --- Assemble from DB — ported from desktop build-from-db.ts ---------------

export async function buildDigestFromDb(db: Database, now: Date): Promise<RefreshDigest> {
  const cfg = await getAttentionConfig(db);
  const children = await getChildren(db);

  const perChildDetails = new Map<string, readonly ClassDetails[]>();
  const perChildHomeworkForToday = new Map<string, readonly HomeworkRecord[]>();
  const perChildHomeworkDueToday = new Map<string, readonly HomeworkRecord[]>();
  const perChildHeroCounts = new Map<string, ChildHeroCounts>();

  const todayIso = toLocalIso(now);

  for (const child of children) {
    const run = await getLatestSuccessfulFetchRun(db, child.id, "teacherease");
    if (!run) {
      // No successful fetch yet — hero shows zeros, no attention/homework.
      perChildHeroCounts.set(child.id, { meetingCount: 0, notAssessedCount: 0 });
      continue;
    }
    perChildDetails.set(child.id, await getAllClassDetails(db, run.id));

    const grades = await getGradesForFetchRun(db, run.id);
    let meetingCount = 0;
    let notAssessedCount = 0;
    for (const g of grades) {
      if (g.status === "meeting") meetingCount += 1;
      else if (g.status === "not_assessed") notAssessedCount += 1;
    }
    perChildHeroCounts.set(child.id, { meetingCount, notAssessedCount });

    perChildHomeworkForToday.set(child.id, await getHomeworkForDay(db, child.id, todayIso));
    perChildHomeworkDueToday.set(child.id, await getHomeworkDueOnDay(db, child.id, todayIso));
  }

  return buildRefreshDigest({
    children,
    perChildDetails,
    perChildHomeworkForToday,
    perChildHomeworkDueToday,
    perChildHeroCounts,
    cfg,
    now,
  });
}

// --- Render (English) — ported from desktop email-templates.ts -------------

export interface RenderedEmail {
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string;
}

const MAX_ATTENTION_ITEMS = 10;
const ICON_ATTENTION = "⚠";
const ICON_MISSING = "📕";
const ICON_LOW_SCORE = "📉";
const ICON_DUE = "🕐";
const ICON_HW_FOR = "📖";
const ICON_HW_DUE = "🎯";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** One-line family summary, shared by the subject and the email header. */
export function buildHeroLine(d: RefreshDigest): string {
  const fam = d.family;
  if (fam.attentionCount === 0) return "All caught up";
  const parts = [`${fam.attentionCount} need attention`];
  if (fam.meetingCount > 0) parts.push(`${fam.meetingCount} meeting`);
  return parts.join(" · ");
}

interface HeroStyle {
  bg: string;
  icon: string;
  iconColor: string;
  titleColor: string;
}
const HERO_OK: HeroStyle = {
  bg: "#ecfdf5",
  icon: "✓",
  iconColor: "#059669",
  titleColor: "#065f46",
};
const HERO_ATTN: HeroStyle = {
  bg: "#fffbeb",
  icon: "⚠",
  iconColor: "#b45309",
  titleColor: "#111827",
};

function childTitle(c: ChildDigest): string {
  if (c.hero.attentionCount === 0) return "All caught up";
  const n = c.hero.attentionCount;
  return `${n} ${n === 1 ? "item needs" : "items need"} attention`;
}

function renderChildHeroRowHtml(c: ChildDigest): string {
  const isOk = c.hero.attentionCount === 0;
  const s = isOk ? HERO_OK : HERO_ATTN;
  const meta = [`${c.hero.meetingCount} meeting`];
  if (c.homeworkConfigured) {
    meta.push(`${c.homeworkForToday.length} homework today`);
    meta.push(`${c.homeworkDueToday.length} due today`);
  }
  const metaLines = meta
    .map((l) => `<p style="margin:2px 0 0;color:#6b7280;font-size:13px;">${escapeHtml(l)}</p>`)
    .join("\n      ");
  return `<div style="padding:12px 16px;border-radius:8px;background:${s.bg};margin:0 0 10px;">
      <p style="margin:0;font-weight:600;font-size:15px;color:${s.titleColor};">
        <span style="color:${s.iconColor};">${s.icon}</span> ${escapeHtml(c.childName)}: ${escapeHtml(childTitle(c))}
      </p>
      ${metaLines}
    </div>`;
}

function renderAttentionRowHtml(item: AttentionItem): string {
  const icon = item.reason === "missing" ? ICON_MISSING : ICON_LOW_SCORE;
  const iconColor = item.reason === "missing" ? "#b45309" : "#9a3412";
  const trail: string[] = [];
  if (item.reason !== "missing" && item.assignment.grade) {
    trail.push(
      `<span style="color:#6b7280;font-weight:600;">${escapeHtml(item.assignment.grade)}</span>`,
    );
  }
  if (item.assignment.dueDate) {
    trail.push(
      `<span style="color:#6b7280;">${ICON_DUE} ${escapeHtml(item.assignment.dueDate)}</span>`,
    );
  }
  const sep = '<span style="color:#9ca3af;"> · </span>';
  const trailStr = trail.length > 0 ? sep + trail.join(sep) : "";
  return `<li style="margin:0 0 6px;list-style:none;font-size:13px;color:#111827;line-height:1.5;">
        <span style="color:${iconColor};">${icon}</span> <strong>${escapeHtml(item.assignment.name)}</strong>${sep}<span style="color:#6b7280;">${escapeHtml(item.className)}</span>${trailStr}
      </li>`;
}

function renderAttentionBlockHtml(c: ChildDigest): string {
  const heading = `<h3 style="margin:4px 0 8px;font-size:13px;color:#374151;text-transform:uppercase;letter-spacing:0.04em;"><span style="color:#b45309;">${ICON_ATTENTION}</span> Needs attention</h3>`;
  if (c.attention.length === 0) {
    return `${heading}<p style="margin:0 0 8px;color:#9ca3af;font-size:13px;">Nothing needs ${escapeHtml(c.childName)}'s attention.</p>`;
  }
  const shown = c.attention.slice(0, MAX_ATTENTION_ITEMS);
  const items = shown.map(renderAttentionRowHtml).join("\n        ");
  const more =
    c.attention.length > MAX_ATTENTION_ITEMS
      ? `<li style="color:#9ca3af;font-size:12px;list-style:none;margin-top:4px;">+${c.attention.length - MAX_ATTENTION_ITEMS} more</li>`
      : "";
  return `${heading}<ul style="margin:0 0 12px;padding:0;">
        ${items}
        ${more}
      </ul>`;
}

function renderHomeworkItemsHtml(rows: readonly HomeworkRecord[]): string {
  return rows
    .map((hw) => {
      const parts = [`<strong>${escapeHtml(hw.subject)}</strong>`];
      if (hw.content)
        parts.push(`<span style="color:#374151;font-size:12px;">${escapeHtml(hw.content)}</span>`);
      if (hw.dueDate) {
        parts.push(
          `<span style="color:#6b7280;font-size:12px;">${ICON_DUE} ${escapeHtml(hw.dueDate)}${hw.dueDateInferred ? "*" : ""}</span>`,
        );
      }
      const inline = parts.join('<span style="color:#9ca3af;"> · </span>');
      return `<li style="margin:0 0 6px;list-style:none;font-size:13px;color:#111827;line-height:1.5;">
        ${inline}
      </li>`;
    })
    .join("\n        ");
}

function renderHomeworkSectionHtml(
  title: string,
  rows: readonly HomeworkRecord[],
  emptyText: string,
  icon: string,
): string {
  const heading = `<h3 style="margin:4px 0 8px;font-size:13px;color:#374151;text-transform:uppercase;letter-spacing:0.04em;"><span style="color:#1d4ed8;">${icon}</span> ${escapeHtml(title)}</h3>`;
  if (rows.length === 0) {
    return `${heading}<p style="margin:0 0 8px;color:#9ca3af;font-size:13px;">${escapeHtml(emptyText)}</p>`;
  }
  return `${heading}<ul style="margin:0 0 8px;padding:0;">
        ${renderHomeworkItemsHtml(rows)}
      </ul>`;
}

function renderChildDetailHtml(c: ChildDigest): string {
  const header = `<h2 style="margin:0 0 10px;font-size:15px;color:#111827;">${escapeHtml(c.childName)}</h2>`;
  const attentionBlock = renderAttentionBlockHtml(c);
  const homeworkBlocks = c.homeworkConfigured
    ? `${renderHomeworkSectionHtml("Homework for today", c.homeworkForToday, "No homework posted for today.", ICON_HW_FOR)}
      ${renderHomeworkSectionHtml("Homework due today", c.homeworkDueToday, "Nothing due today.", ICON_HW_DUE)}`
    : "";
  return `<section style="margin:0 0 20px;padding:12px 0 0;border-top:1px solid #e5e7eb;">
      ${header}
      ${attentionBlock}
      ${homeworkBlocks}
    </section>`;
}

function renderHtml(d: RefreshDigest): string {
  const heroLine = buildHeroLine(d);
  const generated = formatHHmm(new Date(d.generatedAt));
  const heroRows = d.children.map(renderChildHeroRowHtml).join("\n    ");
  const detailSections = d.children.map(renderChildDetailHtml).join("\n    ");
  return `<!doctype html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;margin:0;padding:24px;background:#f3f4f6;color:#111827;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
    <h1 style="margin:0 0 4px;font-size:18px;color:#111827;">${escapeHtml(heroLine)}</h1>
    <p style="color:#9ca3af;margin:0 0 16px;font-size:12px;">Checked at ${escapeHtml(generated)}</p>
    ${heroRows}
    <div style="margin-top:16px;">
      ${detailSections}
    </div>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:11px;">Homework · generated at ${escapeHtml(generated)}</p>
  </div>
</body>
</html>`;
}

function renderChildText(c: ChildDigest): string[] {
  const lines: string[] = ["---", c.childName, ""];
  if (c.attention.length === 0) {
    lines.push(`  Needs attention: nothing needs ${c.childName}'s attention.`);
  } else {
    lines.push("  Needs attention:");
    for (const item of c.attention.slice(0, MAX_ATTENTION_ITEMS)) {
      const reason = item.reason === "missing" ? "MISSING" : "LOW";
      const trail: string[] = [];
      if (item.reason !== "missing" && item.assignment.grade) trail.push(item.assignment.grade);
      if (item.assignment.dueDate) trail.push(`due ${item.assignment.dueDate}`);
      const t = trail.length > 0 ? ` · ${trail.join(" · ")}` : "";
      lines.push(`    [${reason}] ${item.assignment.name} · ${item.className}${t}`);
    }
    if (c.attention.length > MAX_ATTENTION_ITEMS) {
      lines.push(`    (+${c.attention.length - MAX_ATTENTION_ITEMS} more)`);
    }
  }
  if (c.homeworkConfigured) {
    lines.push("");
    lines.push(...renderHomeworkText("Homework for today", c.homeworkForToday, "none posted"));
    lines.push(...renderHomeworkText("Homework due today", c.homeworkDueToday, "nothing due"));
  }
  lines.push("");
  return lines;
}

function renderHomeworkText(
  title: string,
  rows: readonly HomeworkRecord[],
  empty: string,
): string[] {
  if (rows.length === 0) return [`  ${title}: ${empty}`];
  const lines = [`  ${title}:`];
  for (const hw of rows) {
    const bits = [hw.subject];
    if (hw.content) bits.push(hw.content);
    if (hw.dueDate) bits.push(`due ${hw.dueDate}${hw.dueDateInferred ? "*" : ""}`);
    lines.push(`    - ${bits.join(" · ")}`);
  }
  return lines;
}

function renderHeroRowText(c: ChildDigest): string[] {
  const lines = [`${c.childName}: ${childTitle(c)}`, `  ${c.hero.meetingCount} meeting`];
  if (c.homeworkConfigured) {
    lines.push(`  ${c.homeworkForToday.length} homework today`);
    lines.push(`  ${c.homeworkDueToday.length} due today`);
  }
  return lines;
}

function renderText(d: RefreshDigest): string {
  const generated = formatHHmm(new Date(d.generatedAt));
  const parts: string[] = [`Homework: ${buildHeroLine(d)}`, `Checked at ${generated}`, ""];
  for (const c of d.children) {
    parts.push(...renderHeroRowText(c));
    parts.push("");
  }
  for (const c of d.children) {
    parts.push(...renderChildText(c));
  }
  return parts.join("\n").trimEnd();
}

export function renderDigestEmail(d: RefreshDigest): RenderedEmail {
  return {
    subject: `Homework: ${buildHeroLine(d)}`,
    textBody: renderText(d),
    htmlBody: renderHtml(d),
  };
}
