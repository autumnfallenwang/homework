import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
  subTabs?: ReactNode;
}

export function PageHeader({ title, actions, subTabs }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b bg-card">
      <div className="flex items-center justify-between px-5 py-3.5">
        <h1
          className="text-xl font-medium tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {title}
        </h1>
        {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
      </div>
      {subTabs ? <div className="px-5 pt-2">{subTabs}</div> : null}
    </header>
  );
}
