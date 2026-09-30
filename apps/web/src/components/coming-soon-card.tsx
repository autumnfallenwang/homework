import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * A feature that a later stage of the child-homework plan will build, shown now
 * so the whole product can be reviewed (milestone 09). Clearly labelled, its
 * action disabled, no fake data.
 */
export function ComingSoonCard({
  stage,
  icon: Icon,
  title,
  description,
  action,
}: {
  stage: 2 | 3 | 4;
  icon: LucideIcon;
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <div
      className="rounded-lg border border-dashed bg-card/50 px-4 py-4"
      data-testid="coming-soon"
      data-stage={stage}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-medium">{title}</p>
            <Badge variant="secondary" className="text-[10px] font-normal">
              Coming in stage {stage}
            </Badge>
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">{description}</p>
          {action ? (
            <Button size="sm" variant="outline" className="mt-2 h-8" disabled>
              {action}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
