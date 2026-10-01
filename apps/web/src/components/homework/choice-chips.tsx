"use client";

import { useId } from "react";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** Drawn with a dashed edge — the fixed choice after a user-made list ("Other"). */
  fixed?: boolean;
}

/**
 * One choice from a short list, as colored chips (the class and type pickers on
 * the homework page). Real radio buttons underneath, so arrow keys and screen
 * readers work as for any radio group.
 */
export function ChoiceChips<T extends string>({
  legend,
  options,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0 space-y-2" disabled={disabled}>
      <legend className="mb-2 text-[12px] font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={`inline-block rounded-full border bg-card px-3.5 py-1 text-[13px] transition-colors hover:border-primary/60 peer-checked:border-primary peer-checked:border-solid peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 ${
                o.fixed ? "border-dashed" : ""
              }`}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
