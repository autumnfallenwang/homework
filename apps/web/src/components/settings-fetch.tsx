"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { CHILD_DATA_REFRESHED_EVENT } from "@/components/shell/sidebar-child-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  type ChildRecord,
  type FetchRunRecord,
  getChildren,
  getLatestSuccessfulFetchRun,
  getSettingBool,
  getSettingString,
  setSettingBool,
  setSettingString,
  triggerFetch,
} from "@/lib/api";
import {
  computeFetchSlots,
  FETCH_FIRST_SLOT_DEFAULT,
  FETCH_RUNS_PER_DAY_DEFAULT,
  FETCH_RUNS_PER_DAY_MAX,
  FETCH_RUNS_PER_DAY_MIN,
  formatSlotMinutes,
  isWeekend,
  parseFetchFirstSlot,
  parseFetchRunsPerDay,
} from "@/lib/schedule-helpers";

const KEY_RUNS_PER_DAY = "fetch.runsPerDay";
const KEY_FIRST_SLOT_AT = "fetch.firstSlotAt";
const KEY_WEEKDAYS_ONLY = "fetch.weekdaysOnly";

interface ChildLastRun {
  readonly child: ChildRecord;
  readonly latest: FetchRunRecord | null;
}

function formatLocal(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function SettingsFetch() {
  const [runsPerDay, setRunsPerDay] = useState<number>(FETCH_RUNS_PER_DAY_DEFAULT);
  const [runsDraft, setRunsDraft] = useState<string>(String(FETCH_RUNS_PER_DAY_DEFAULT));
  const [firstSlotAt, setFirstSlotAt] = useState<string>(FETCH_FIRST_SLOT_DEFAULT);
  const [firstSlotDraft, setFirstSlotDraft] = useState<string>(FETCH_FIRST_SLOT_DEFAULT);
  const [weekdaysOnly, setWeekdaysOnly] = useState<boolean>(false);
  const [childLastRuns, setChildLastRuns] = useState<ChildLastRun[]>([]);
  const [fetching, setFetching] = useState(false);

  const reloadChildren = useCallback(async () => {
    const children = await getChildren();
    const rows: ChildLastRun[] = [];
    for (const c of children) {
      const latest = await getLatestSuccessfulFetchRun(c.id, "teacherease");
      rows.push({ child: c, latest });
    }
    setChildLastRuns(rows);
  }, []);

  useEffect(() => {
    void (async () => {
      const [rawRuns, rawSlot, wd] = await Promise.all([
        getSettingString(KEY_RUNS_PER_DAY, String(FETCH_RUNS_PER_DAY_DEFAULT)),
        getSettingString(KEY_FIRST_SLOT_AT, FETCH_FIRST_SLOT_DEFAULT),
        getSettingBool(KEY_WEEKDAYS_ONLY, false),
      ]);
      const parsedRuns = parseFetchRunsPerDay(rawRuns);
      const parsedSlot = parseFetchFirstSlot(rawSlot);
      setRunsPerDay(parsedRuns);
      setRunsDraft(String(parsedRuns));
      setFirstSlotAt(parsedSlot);
      setFirstSlotDraft(parsedSlot);
      setWeekdaysOnly(wd);
      await reloadChildren();
    })();

    const handleDataRefreshed = () => {
      void reloadChildren();
    };
    window.addEventListener(CHILD_DATA_REFRESHED_EVENT, handleDataRefreshed);
    return () => window.removeEventListener(CHILD_DATA_REFRESHED_EVENT, handleDataRefreshed);
  }, [reloadChildren]);

  // Chronologically-sorted slot list + rollover flag per slot, computed
  // against the current local clock. When weekdaysOnly is on and today is
  // Sat/Sun, render Monday's slots tagged "(Mon)" instead.
  const slotView = useMemo(() => {
    const raw = computeFetchSlots(runsPerDay, firstSlotAt);
    const now = new Date();
    const showMondayInstead = weekdaysOnly && isWeekend(now);
    if (showMondayInstead) {
      return [...raw].sort((a, b) => a - b).map((mins) => ({ mins, rollover: true as const }));
    }
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const todaySlots = [...raw].filter((s) => s > nowMins).sort((a, b) => a - b);
    const tomorrowSlots = [...raw].filter((s) => s <= nowMins).sort((a, b) => a - b);
    return [
      ...todaySlots.map((mins) => ({ mins, rollover: false as const })),
      ...tomorrowSlots.map((mins) => ({ mins, rollover: true as const })),
    ];
  }, [runsPerDay, firstSlotAt, weekdaysOnly]);

  const rolloverLabel = useMemo(() => {
    const now = new Date();
    return weekdaysOnly && isWeekend(now) ? "(Mon)" : "(tomorrow)";
  }, [weekdaysOnly]);

  const commitRunsPerDay = () => {
    const parsed = parseFetchRunsPerDay(runsDraft);
    setRunsDraft(String(parsed));
    if (parsed === runsPerDay) return;
    setRunsPerDay(parsed);
    void setSettingString(KEY_RUNS_PER_DAY, String(parsed)).catch(() => {});
  };

  const commitFirstSlot = () => {
    const parsed = parseFetchFirstSlot(firstSlotDraft);
    setFirstSlotDraft(parsed);
    if (parsed === firstSlotAt) return;
    setFirstSlotAt(parsed);
    void setSettingString(KEY_FIRST_SLOT_AT, parsed).catch(() => {});
  };

  const toggleWeekdays = async (next: boolean) => {
    setWeekdaysOnly(next);
    try {
      await setSettingBool(KEY_WEEKDAYS_ONLY, next);
    } catch {
      // Ignore transient persistence failures; the toggle already reflects intent.
    }
  };

  const handleFetchNow = async () => {
    setFetching(true);
    try {
      const children = await getChildren();
      await Promise.all(children.map((c) => triggerFetch(c.id).catch(() => undefined)));
      await reloadChildren();
      window.dispatchEvent(new CustomEvent(CHILD_DATA_REFRESHED_EVENT));
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Schedule"
        help="How often — and anchored where — the app pulls fresh data from the portal. Slots are evenly spaced from “First slot at” around the 24h cycle."
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fetch-runs-per-day" className="text-[13px]">
              Fetches per day ({FETCH_RUNS_PER_DAY_MIN}–{FETCH_RUNS_PER_DAY_MAX})
            </Label>
            <Input
              id="fetch-runs-per-day"
              type="number"
              min={FETCH_RUNS_PER_DAY_MIN}
              max={FETCH_RUNS_PER_DAY_MAX}
              value={runsDraft}
              onChange={(e) => setRunsDraft(e.target.value)}
              onBlur={commitRunsPerDay}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRunsPerDay();
                }
              }}
              className="h-9 w-24 rounded-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fetch-first-slot" className="text-[13px]">
              First slot at
            </Label>
            <Input
              id="fetch-first-slot"
              type="time"
              value={firstSlotDraft}
              onChange={(e) => setFirstSlotDraft(e.target.value)}
              onBlur={commitFirstSlot}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitFirstSlot();
                }
              }}
              className="h-9 w-32 rounded-lg"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Time slots</p>
          <div className="flex flex-wrap gap-1.5">
            {slotView.map(({ mins, rollover }) => (
              <span
                key={`${mins}-${rollover ? "r" : "t"}`}
                className="rounded-full border border-border px-2.5 py-1 text-[12px] tabular-nums text-muted-foreground"
              >
                {formatSlotMinutes(mins)}
                {rollover && <span className="ml-1 text-[10px] opacity-70">{rolloverLabel}</span>}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Switch
            checked={weekdaysOnly}
            onChange={(next) => {
              void toggleWeekdays(next);
            }}
            aria-label="Skip weekends"
          />
          <span className="text-[13px]">Skip weekends (Sat + Sun)</span>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Fetch now"
        help="Pulls the latest data for every child immediately. No notification fires — only the database updates. Use this when you want to see current data without waiting for the next scheduled run."
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={fetching}
          onClick={() => {
            void handleFetchNow();
          }}
          className="gap-1.5"
        >
          {fetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {fetching ? "Fetching…" : "Fetch now"}
        </Button>
      </SettingsSection>

      {childLastRuns.length > 0 && (
        <SettingsSection
          title="Last successful fetch"
          help="When each child was last pulled via the TeacherEase source. Empty when a child has never successfully scraped."
          card={false}
        >
          <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {childLastRuns.map(({ child, latest }) => (
              <div key={child.id} className="flex items-center gap-3 px-4 py-2.5">
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {child.displayName}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {latest ? formatLocal(latest.runAt) : "Never"}
                </p>
              </div>
            ))}
          </div>
        </SettingsSection>
      )}
    </div>
  );
}
