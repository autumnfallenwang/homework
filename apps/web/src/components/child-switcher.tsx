import { ChevronDown } from "lucide-react";
import type { ChildRecord } from "@/lib/api";

interface ChildSwitcherProps {
  items: ChildRecord[];
  selectedId: string;
  onSelect: (childId: string) => void;
}

export function ChildSwitcher({ items, selectedId, onSelect }: ChildSwitcherProps) {
  if (items.length <= 1) return null;

  return (
    <div className="relative">
      <select
        className="appearance-none rounded-md border bg-card py-1 pl-2.5 pr-7 text-[13px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
      >
        {items.map((child) => (
          <option key={child.id} value={child.id}>
            {child.displayName}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
