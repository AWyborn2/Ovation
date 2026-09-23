import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Centred 1280px content column with the Broadcast page gutter. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1280px] px-[var(--pad)]", className)}>{children}</div>
  );
}

/** Vertical rhythm between page sections (clamp 24–40px). */
export function PageStack({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-[var(--gap-section)]", className)}>{children}</div>;
}

/** 11px uppercase overline; `accent` uses the contrast-safe accent text. */
export function Eyebrow({
  children,
  accent,
  className,
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.14em]",
        accent ? "text-primary-text" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Page title block: eyebrow, H1, subtitle, and right-aligned actions. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0 space-y-2">
        {eyebrow && <Eyebrow accent>{eyebrow}</Eyebrow>}
        <h1 className="text-[clamp(38px,4.6vw,64px)] leading-none">{title}</h1>
        {subtitle && <p className="max-w-[60ch] text-[15px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Card with an H2 title row and optional action (e.g. "All matches →"). */
export function SectionCard({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border bg-card p-[clamp(16px,2vw,24px)] text-card-foreground",
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-[clamp(22px,2.2vw,28px)] leading-none">{title}</h2>}
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
