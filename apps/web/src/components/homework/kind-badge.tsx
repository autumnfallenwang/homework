import { HOMEWORK_KIND_LABELS, type HomeworkKind } from "@homework/shared";

const STYLE: Record<Exclude<HomeworkKind, "homework">, string> = {
  test: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  project: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
  other: "bg-muted text-muted-foreground",
};

/** Tests and projects stand out wherever an item appears; plain homework has no badge. */
export function KindBadge({ kind }: { kind: HomeworkKind }) {
  if (kind === "homework") return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-px text-[11px] font-medium ${STYLE[kind]}`}
    >
      {HOMEWORK_KIND_LABELS[kind]}
    </span>
  );
}
