// Homework page parser. Pure module — no network. Source: public Google Sites
// page. Content lives in a single div; cheerio's `.text()` returns one
// concatenated string per entry, so parsing is position-based against a known
// subject list. Ported verbatim from the desktop app.

import { load } from "cheerio";
import type { HomeworkEntry, HomeworkSubject } from "./types.js";

export const HOMEWORK_CONTENT_SELECTOR = "div.hJDwNd-AhqUyc-uQSCkd";

export const DEFAULT_HOMEWORK_SUBJECTS = ["Science", "World Geography", "English", "Math"] as const;

const ENTRY_ANCHOR = /Homework for\s+(\d{1,2}\/\d{1,2}\/\d{2})/g;
const DUE_MARKER = /Due:\s+([A-Za-z]+\s+\d{1,2}\/\d{1,2})\s*$/;

export interface HomeworkParseOptions {
  readonly subjects?: readonly string[];
}

export function parseHomework(html: string, options?: HomeworkParseOptions): HomeworkEntry[] {
  const doc = load(html);
  const div = doc(HOMEWORK_CONTENT_SELECTOR).first();
  if (div.length === 0) return [];

  const text = div.text();
  if (!text.trim()) return [];

  const subjects = options?.subjects ?? DEFAULT_HOMEWORK_SUBJECTS;

  const anchors: Array<{ date: string; matchStart: number; bodyStart: number }> = [];
  ENTRY_ANCHOR.lastIndex = 0;
  let m: RegExpExecArray | null = ENTRY_ANCHOR.exec(text);
  while (m !== null) {
    anchors.push({
      date: m[1] ?? "",
      matchStart: m.index,
      bodyStart: m.index + m[0].length,
    });
    m = ENTRY_ANCHOR.exec(text);
  }
  if (anchors.length === 0) return [];

  const entries: HomeworkEntry[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const here = anchors[i];
    if (!here) continue;
    const next = anchors[i + 1];
    const body = text.slice(here.bodyStart, next ? next.matchStart : text.length);
    entries.push({ date: here.date, subjects: parseSubjects(body, subjects) });
  }
  return entries;
}

function parseSubjects(body: string, knownSubjects: readonly string[]): HomeworkSubject[] {
  const positions: Array<{ name: string; start: number }> = [];
  for (const name of knownSubjects) {
    const idx = body.indexOf(name);
    if (idx >= 0) positions.push({ name, start: idx });
  }
  if (positions.length === 0) return [];

  positions.sort((a, b) => a.start - b.start);

  const result: HomeworkSubject[] = [];
  for (let i = 0; i < positions.length; i++) {
    const here = positions[i];
    const next = positions[i + 1];
    if (!here) continue;
    const segmentStart = here.start + here.name.length;
    const segmentEnd = next ? next.start : body.length;
    const raw = body.slice(segmentStart, segmentEnd);
    result.push(extractSubjectParts(here.name, raw));
  }
  return result;
}

function extractSubjectParts(name: string, raw: string): HomeworkSubject {
  const stripped = raw.replace(/^[\s:]+/, "");
  const match = DUE_MARKER.exec(stripped);
  if (!match) {
    return { name, content: stripped.trim(), dueDate: null };
  }
  const content = stripped.slice(0, match.index).trim();
  return { name, content, dueDate: match[1]?.trim() ?? null };
}
