import { GraduationCap } from "lucide-react";
import type { ReactNode } from "react";

/** The centred card the sign-in and join pages share. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-2xl bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <GraduationCap className="h-8 w-8 text-primary" strokeWidth={1.5} />
          </div>
          <div className="space-y-1">
            <h1
              className="text-2xl font-medium tracking-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {title}
            </h1>
            {subtitle ? (
              <p className="text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">{children}</div>
      </div>
    </div>
  );
}

/** A form error line. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[12px] text-destructive">
      {message}
    </p>
  );
}
