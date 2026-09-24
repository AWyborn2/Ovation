import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A settings form card (Social Studio KTD13): a titled card of rows, each a
 * label with helper text on the left and its control on the right (stacked on
 * narrow screens).
 */
export function SettingsCard({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  helper,
  htmlFor,
  children,
}: {
  label: ReactNode;
  helper?: ReactNode;
  /** The control's id, so clicking the label focuses it. */
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium text-foreground">{label}</p>
        )}
        {helper && <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
