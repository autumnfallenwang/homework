"use client";

import { computeChildAttention, parseAttentionConfig } from "@homework/shared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AttentionSection } from "@/components/attention-section";
import { EmptyState } from "@/components/empty-state";
import { HomeworkTodaySections } from "@/components/homework-card";
import { PageHeader } from "@/components/shell/page-header";
import { CHILD_DATA_REFRESHED_EVENT } from "@/components/shell/sidebar-child-selector";
import { StatusHero } from "@/components/status-hero";
import { useSelectedChild } from "@/hooks/use-selected-child";
import {
  type AttentionConfig,
  type ChildRecord,
  type ClassDetails,
  type FetchRunRecord,
  getAllClassDetails,
  getAttentionConfig,
  getChildren,
  getHomeworkForDay,
  getLatestFetchRun,
  getLatestSuccessfulFetchRun,
  type HomeworkRecord,
} from "@/lib/api";
import { type ChildStatus, loadHeroStatuses } from "@/lib/hero-statuses";
import { toLocalIso } from "@/lib/local-date";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Dashboard() {
  const { selectedChildId: childId, setSelectedChildId } = useSelectedChild();
  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [lastFetchRun, setLastFetchRun] = useState<FetchRunRecord | null>(null);
  const [classDetails, setClassDetails] = useState<ClassDetails[]>([]);
  const [attentionCfg, setAttentionCfg] = useState<AttentionConfig>(
    parseAttentionConfig(null, null),
  );
  const [homeworkForToday, setHomeworkForToday] = useState<HomeworkRecord[]>([]);
  const [homeworkDueToday, setHomeworkDueToday] = useState<HomeworkRecord[]>([]);
  const [heroStatuses, setHeroStatuses] = useState<ChildStatus[]>([]);

  // Attention engine (Phase 15 AT2) — computed from the full ClassDetails
  // tree + the user-tunable forgiveness + low-score config. `new Date()`
  // re-evaluates on every data refresh.
  const attentionResult = useMemo(
    () => computeChildAttention(classDetails, new Date(), attentionCfg),
    [classDetails, attentionCfg],
  );

  const loadData = useCallback(async (cId: string) => {
    // "Checked Xm ago" uses the most-recent attempt (any source/status) —
    // it means "when did we last try?". Grade reads come from the latest
    // SUCCESSFUL teacherease run so a stale/failed scrape doesn't blank
    // out prior good data.
    const [latestRun, teRun] = await Promise.all([
      getLatestFetchRun(cId),
      getLatestSuccessfulFetchRun(cId, "teacherease"),
    ]);
    setLastFetchRun(latestRun);
    if (teRun) {
      const [cd, cfg] = await Promise.all([getAllClassDetails(teRun.id), getAttentionConfig()]);
      setClassDetails(cd);
      setAttentionCfg(cfg);
    } else {
      setClassDetails([]);
    }
    const today = toLocalIso(new Date());
    const rows = await getHomeworkForDay(cId, today);
    setHomeworkForToday(rows.filter((r) => r.hwDate === today));
    setHomeworkDueToday(rows.filter((r) => r.dueDate === today));
  }, []);

  const reloadHero = useCallback(async (children: ChildRecord[]) => {
    const cfg = await getAttentionConfig();
    const result = await loadHeroStatuses(children, cfg, new Date());
    setHeroStatuses(result.statuses);
  }, []);

  useEffect(() => {
    void getChildren()
      .then(async (children) => {
        setAllChildren(children);
        if (children.length === 0) return;
        await reloadHero(children);
      })
      .catch(() => undefined);
  }, [reloadHero]);

  useEffect(() => {
    if (childId == null) return;
    void loadData(childId);
  }, [childId, loadData]);

  // Scheduler emits CHILD_DATA_REFRESHED_EVENT after every fetch cycle —
  // reload the displayed data + hero statuses in response. Also re-reads
  // child list (children may have been added/removed from Settings while
  // dashboard was mounted).
  useEffect(() => {
    const handleDataRefreshed = () => {
      void (async () => {
        const children = await getChildren();
        setAllChildren(children);
        if (children.length > 0) {
          await reloadHero(children);
        }
        if (childId != null) await loadData(childId);
      })();
    };
    window.addEventListener(CHILD_DATA_REFRESHED_EVENT, handleDataRefreshed);
    return () => window.removeEventListener(CHILD_DATA_REFRESHED_EVENT, handleDataRefreshed);
  }, [childId, loadData, reloadHero]);

  const handleChildSelect = useCallback(
    (newChildId: string) => {
      if (newChildId === childId) return;
      setSelectedChildId(newChildId);
    },
    [childId, setSelectedChildId],
  );

  if (childId === null && allChildren.length === 0) {
    return (
      <>
        <PageHeader title="Today" />
        <div className="flex flex-1 flex-col">
          <EmptyState />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Today"
        actions={
          lastFetchRun?.runAt ? (
            <span className="text-[11px] text-muted-foreground">
              {`Checked ${formatTimeAgo(lastFetchRun.runAt)}`}
            </span>
          ) : null
        }
      />
      <div className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
        <StatusHero statuses={heroStatuses} onChildSelect={handleChildSelect} />

        <AttentionSection
          withinWindow={attentionResult.withinWindow}
          agedOut={attentionResult.agedOut}
        />

        {allChildren.find((c) => c.id === childId)?.homeworkUrl && (
          <HomeworkTodaySections forToday={homeworkForToday} dueToday={homeworkDueToday} />
        )}

        <div className="pt-2 text-center">
          <Link
            href="/classes"
            className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            View all classes →
          </Link>
        </div>
      </div>
    </>
  );
}
