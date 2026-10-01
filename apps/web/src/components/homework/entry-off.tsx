import { ClipboardList } from "lucide-react";

/** What a child sees while their profile still takes homework from the class page. */
export function HomeworkEntryOff() {
  return (
    <div className="rounded-lg bg-card px-4 py-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <ClipboardList className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
      <p className="text-[14px] font-medium">Homework entry is off</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Ask a parent to turn on “Child enters homework” in Settings → Children.
      </p>
    </div>
  );
}
