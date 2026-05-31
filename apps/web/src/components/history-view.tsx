"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatHomeworkDate, HomeworkRow } from "@/components/homework-card";
import { PageHeader } from "@/components/shell/page-header";
import { useSelectedChild } from "@/hooks/use-selected-child";
import {
  type ChildRecord,
  getChildren,
  getHomeworkByMonth,
  getHomeworkMonths,
  type HomeworkRecord,
} from "@/lib/api";

interface MonthOption {
  readonly yearMonth: string;
  readonly count: number;
}

/** "2026-04" → "April 2026". */
function formatMonthLabel(yearMonth: string): string {
  const parts = yearMonth.split("-");
  const y = Number.parseInt(parts[0] ?? "", 10);
  const m = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return yearMonth;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

function currentYearMonth(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-8 text-center">
      <p className="text-[13px] text-muted-foreground">{text}</p>
    </div>
  );
}

function HomeworkSection({
  rows,
  childHomeworkUrl,
  monthLabel,
}: {
  rows: HomeworkRecord[];
  childHomeworkUrl: string | null;
  monthLabel: string | null;
}) {
  if (rows.length === 0) {
    let text: string;
    if (!childHomeworkUrl) {
      text = "To track homework for this child, add a Google Sites URL under Settings → Children.";
    } else if (monthLabel) {
      text = `No homework recorded for ${monthLabel}.`;
    } else {
      text = "No homework recorded yet for this child.";
    }
    return <EmptyRow text={text} />;
  }

  const groups = new Map<string, HomeworkRecord[]>();
  for (const r of rows) {
    const existing = groups.get(r.hwDate);
    if (existing) existing.push(r);
    else groups.set(r.hwDate, [r]);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([date, entries]) => (
        <div key={date} className="space-y-2">
          <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            {formatHomeworkDate(date)}
          </p>
          <div className="space-y-1.5">
            {entries.map((entry) => (
              <HomeworkRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HistoryView() {
  const { selectedChildId: childId } = useSelectedChild();

  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [months, setMonths] = useState<MonthOption[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [homeworkRows, setHomeworkRows] = useState<HomeworkRecord[]>([]);

  const loadMonths = useCallback(async (cId: string): Promise<MonthOption[]> => {
    const raw = await getHomeworkMonths(cId);
    const opts: MonthOption[] = raw.map((r) => ({ yearMonth: r.yearMonth, count: r.count }));
    setMonths(opts);
    return opts;
  }, []);

  useEffect(() => {
    void getChildren()
      .then(setAllChildren)
      .catch(() => undefined);
  }, []);

  // On child switch: load month list, pick default (current month if present,
  // else most recent month with data, else null for empty-state render).
  useEffect(() => {
    if (childId == null) return;
    setHomeworkRows([]);
    setSelectedMonth(null);
    void (async () => {
      const opts = await loadMonths(childId);
      if (opts.length === 0) {
        setSelectedMonth(null);
        return;
      }
      const current = currentYearMonth();
      const pick =
        opts.find((m) => m.yearMonth === current)?.yearMonth ?? opts[0]?.yearMonth ?? null;
      setSelectedMonth(pick);
    })();
  }, [childId, loadMonths]);

  // Load rows for the selected month.
  useEffect(() => {
    if (childId == null || selectedMonth == null) {
      setHomeworkRows([]);
      return;
    }
    void getHomeworkByMonth(childId, selectedMonth).then(setHomeworkRows);
  }, [childId, selectedMonth]);

  const currentChildHomeworkUrl = useMemo(
    () => allChildren.find((c) => c.id === childId)?.homeworkUrl ?? null,
    [allChildren, childId],
  );

  const monthLabel = selectedMonth ? formatMonthLabel(selectedMonth) : null;

  return (
    <>
      <PageHeader title="History" />
      <div className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
        {months.length > 0 && (
          <div className="flex items-center gap-3">
            <label htmlFor="history-month" className="text-[13px] font-medium">
              Month
            </label>
            <select
              id="history-month"
              value={selectedMonth ?? ""}
              onChange={(e) => setSelectedMonth(e.target.value || null)}
              className="h-9 rounded-lg border border-input bg-card px-2 text-[13px] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {months.map((m) => (
                <option key={m.yearMonth} value={m.yearMonth}>
                  {formatMonthLabel(m.yearMonth)} ({m.count})
                </option>
              ))}
            </select>
          </div>
        )}
        <HomeworkSection
          rows={homeworkRows}
          childHomeworkUrl={currentChildHomeworkUrl}
          monthLabel={monthLabel}
        />
      </div>
    </>
  );
}
