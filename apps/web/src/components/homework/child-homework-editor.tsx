"use client";

import type { HomeworkClass, HomeworkItem } from "@homework/shared";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { getChildProfile, getMyHomeworkClasses, getMyHomeworkItem } from "@/lib/api";
import { toLocalIso } from "@/lib/local-date";
import { HomeworkEntryOff } from "./entry-off";
import { describeHomeworkError, HomeworkForm } from "./homework-form";
import { PhotoViewerProvider } from "./photo-viewer";
import { SolutionForm } from "./solution-form";

/**
 * The child's item page (ADR 0008): the homework with its own Save, and once it
 * is saved, the solution below with its own Save. Loads what the page needs, or
 * says why it can't. Kept plain: titles, required marks and placeholders only —
 * the rules show up as errors when a save breaks them.
 */
export function ChildHomeworkEditor({ itemId }: { itemId: string | null }) {
  const [created, setCreated] = useState(false);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "off" }
    | { kind: "error"; message: string }
    | { kind: "ready"; classes: HomeworkClass[]; item: HomeworkItem | null }
  >({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const profile = await getChildProfile();
        if (!profile.homeworkEntry) {
          if (live) setState({ kind: "off" });
          return;
        }
        const [classes, item] = await Promise.all([
          getMyHomeworkClasses(),
          itemId ? getMyHomeworkItem(itemId) : Promise.resolve(null),
        ]);
        if (live) setState({ kind: "ready", classes, item });
      } catch (err) {
        if (live) setState({ kind: "error", message: describeHomeworkError(err) });
      }
    })();
    return () => {
      live = false;
    };
  }, [itemId]);

  return (
    <>
      <PageHeader title={itemId || created ? "Edit homework" : "Add homework"} />
      {state.kind === "loading" ? (
        <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-muted-foreground" />
      ) : state.kind === "off" ? (
        <div className="mx-auto w-full max-w-2xl px-4 py-5">
          <HomeworkEntryOff />
        </div>
      ) : state.kind === "error" ? (
        <p className="mx-auto mt-6 w-full max-w-2xl px-4 text-[0.8125rem] text-destructive">
          {state.message}
        </p>
      ) : (
        <ItemPage
          initial={state.item}
          classes={state.classes}
          onCreated={(item) => {
            setCreated(true);
            // Stay on the page (keeping its notice) but give it the item's address.
            window.history.replaceState(null, "", `/child/homework/${item.id}`);
          }}
        />
      )}
    </>
  );
}

function ItemPage({
  initial,
  classes,
  onCreated,
}: {
  initial: HomeworkItem | null;
  classes: HomeworkClass[];
  onCreated: (item: HomeworkItem) => void;
}) {
  const [item, setItem] = useState(initial);

  return (
    <PhotoViewerProvider>
      <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6">
        <section aria-labelledby="hw-section-homework">
          <h2 id="hw-section-homework" className="sr-only">
            Homework
          </h2>
          <HomeworkForm
            item={item}
            classes={classes}
            today={toLocalIso(new Date())}
            onSaved={(saved, created) => {
              setItem(saved);
              if (created) onCreated(saved);
            }}
          />
        </section>

        {item ? (
          <section className="mt-10" aria-labelledby="hw-section-solution">
            <h2
              id="hw-section-solution"
              className="mb-1 flex items-center gap-2 text-xl font-medium"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Solution
              {item.submittedAt ? (
                <span className="flex items-center gap-1 font-sans text-[0.75rem] font-medium text-meeting">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Done
                </span>
              ) : null}
            </h2>
            <SolutionForm key={item.id} item={item} onSaved={setItem} />
          </section>
        ) : null}
      </div>
    </PhotoViewerProvider>
  );
}
