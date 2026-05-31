"use client";

// Unified Notifications panel (Phase 19 CF5 + Phase 21 NS7). Absorbs the
// old "Email" sub-tab so every output channel lives in one place. Schedule
// section mirrors Settings → Fetch (N×/day + first-slot-at + Skip-weekends).
// The OS-notification channel is dropped in the web port — email is the only
// digest channel.

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { SettingsEmailSection } from "@/components/settings-email-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getSettingBool,
  getSettingString,
  sendDigestNow,
  setSettingBool,
  setSettingString,
} from "@/lib/api";
import {
  computeNotifySlots,
  formatSlotMinutes,
  isWeekend,
  NOTIFY_FETCH_BEFORE_DEFAULT,
  NOTIFY_FIRST_SLOT_DEFAULT,
  NOTIFY_RUNS_PER_DAY_DEFAULT,
  NOTIFY_RUNS_PER_DAY_MAX,
  NOTIFY_RUNS_PER_DAY_MIN,
  parseNotifyFirstSlot,
  parseNotifyRunsPerDay,
} from "@/lib/schedule-helpers";

const NOTIFY_RUNS_PER_DAY_KEY = "notify.runsPerDay";
const NOTIFY_FIRST_SLOT_KEY = "notify.firstSlotAt";
const NOTIFY_WEEKDAYS_ONLY_KEY = "notify.weekdaysOnly";
const NOTIFY_FETCH_BEFORE_KEY = "notify.fetchBeforeDispatch";

export function SettingsNotifications() {
  const [runsPerDay, setRunsPerDay] = useState<number>(NOTIFY_RUNS_PER_DAY_DEFAULT);
  const [runsDraft, setRunsDraft] = useState<string>(String(NOTIFY_RUNS_PER_DAY_DEFAULT));
  const [firstSlotAt, setFirstSlotAt] = useState<string>(NOTIFY_FIRST_SLOT_DEFAULT);
  const [firstSlotDraft, setFirstSlotDraft] = useState<string>(NOTIFY_FIRST_SLOT_DEFAULT);
  const [weekdaysOnly, setWeekdaysOnly] = useState<boolean>(false);
  const [fetchBefore, setFetchBefore] = useState<boolean>(NOTIFY_FETCH_BEFORE_DEFAULT);

  const [sendingDigest, setSendingDigest] = useState(false);
  const [digestResult, setDigestResult] = useState<{ kind: "ok" | "err"; message: string } | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      const [rawRuns, rawSlot, wd, fb] = await Promise.all([
        getSettingString(NOTIFY_RUNS_PER_DAY_KEY, String(NOTIFY_RUNS_PER_DAY_DEFAULT)),
        getSettingString(NOTIFY_FIRST_SLOT_KEY, NOTIFY_FIRST_SLOT_DEFAULT),
        getSettingBool(NOTIFY_WEEKDAYS_ONLY_KEY, false),
        getSettingBool(NOTIFY_FETCH_BEFORE_KEY, NOTIFY_FETCH_BEFORE_DEFAULT),
      ]);
      const parsedRuns = parseNotifyRunsPerDay(rawRuns);
      const parsedSlot = parseNotifyFirstSlot(rawSlot);
      setRunsPerDay(parsedRuns);
      setRunsDraft(String(parsedRuns));
      setFirstSlotAt(parsedSlot);
      setFirstSlotDraft(parsedSlot);
      setWeekdaysOnly(wd);
      setFetchBefore(fb);
    })();
  }, []);

  const commitRunsPerDay = () => {
    const parsed = parseNotifyRunsPerDay(runsDraft);
    setRunsDraft(String(parsed));
    if (parsed === runsPerDay) return;
    setRunsPerDay(parsed);
    void setSettingString(NOTIFY_RUNS_PER_DAY_KEY, String(parsed)).catch(() => {});
  };

  const commitFirstSlot = () => {
    const parsed = parseNotifyFirstSlot(firstSlotDraft);
    setFirstSlotDraft(parsed);
    if (parsed === firstSlotAt) return;
    setFirstSlotAt(parsed);
    void setSettingString(NOTIFY_FIRST_SLOT_KEY, parsed).catch(() => {});
  };

  const toggleWeekdays = async (next: boolean) => {
    setWeekdaysOnly(next);
    try {
      await setSettingBool(NOTIFY_WEEKDAYS_ONLY_KEY, next);
    } catch {
      // Ignore transient persistence failures.
    }
  };

  const toggleFetchBefore = async (next: boolean) => {
    setFetchBefore(next);
    try {
      await setSettingBool(NOTIFY_FETCH_BEFORE_KEY, next);
    } catch {
      // Ignore transient persistence failures.
    }
  };

  const handleSendDigestNow = async () => {
    setSendingDigest(true);
    setDigestResult(null);
    try {
      const result = await sendDigestNow();
      setDigestResult({
        kind: result.sent ? "ok" : "err",
        message: result.sent
          ? "Dispatched via your enabled channels — check them now."
          : "Nothing was dispatched. Check that the email digest is configured and enabled.",
      });
    } catch (e) {
      setDigestResult({
        kind: "err",
        message: e instanceof Error ? e.message : "Failed to send digest.",
      });
    } finally {
      setSendingDigest(false);
      setTimeout(() => setDigestResult(null), 5000);
    }
  };

  // Chip view: chronological list with "(tomorrow)" / "(Mon)" tags per slot.
  // When weekdaysOnly is on and "today" is Sat/Sun, show Monday's slots.
  const slotView = useMemo(() => {
    const raw = computeNotifySlots(runsPerDay, firstSlotAt);
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

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Email"
        help="SMTP-based daily digest with per-child detail. You bring the SMTP credentials; nothing relays through our servers. Click Update to change config and fire a test email."
        card={false}
      >
        <SettingsEmailSection />
      </SettingsSection>

      <SettingsSection
        title="Schedule"
        help="How many times per day — and anchored where — a digest fires. By default each run pulls grades and homework from TeacherEase right before sending so the digest reflects current portal state; turn off 'Fetch fresh data first' to skip the pull and use whatever data is already in the database (faster, but may be stale)."
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="notify-runs-per-day" className="text-[13px]">
                Notifications per day ({NOTIFY_RUNS_PER_DAY_MIN}–{NOTIFY_RUNS_PER_DAY_MAX})
              </Label>
              <Input
                id="notify-runs-per-day"
                type="number"
                min={NOTIFY_RUNS_PER_DAY_MIN}
                max={NOTIFY_RUNS_PER_DAY_MAX}
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
              <Label htmlFor="notify-first-slot" className="text-[13px]">
                First slot at
              </Label>
              <Input
                id="notify-first-slot"
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

          <div className="flex items-center gap-3 pt-1">
            <Switch
              checked={fetchBefore}
              onChange={(next) => {
                void toggleFetchBefore(next);
              }}
              aria-label="Fetch fresh data first"
            />
            <span className="text-[13px]">Fetch fresh data first</span>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Send digest now"
        help="Builds a digest from current data and dispatches through your enabled channels (respects the toggles above). Useful to preview what the next scheduled notification will look like."
      >
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={sendingDigest}
            onClick={() => {
              void handleSendDigestNow();
            }}
            className="gap-1.5"
          >
            {sendingDigest && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {sendingDigest ? "Sending…" : "Send digest now"}
          </Button>
          {digestResult && (
            <p
              className={`text-[12px] ${
                digestResult.kind === "ok" ? "text-muted-foreground" : "text-destructive"
              }`}
            >
              {digestResult.message}
            </p>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
