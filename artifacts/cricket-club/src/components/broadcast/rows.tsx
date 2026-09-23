import type { ReactNode } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { ResultPill } from "./pills";

/** Initials for a person's name ("Mitchell Caine" → "MC"; "Caine, Mitchell" → "MC"). */
export function initialsOf(name: string): string {
  const cleaned = name.includes(",") ? name.split(",").reverse().join(" ") : name;
  const parts = cleaned.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Round avatar: headshot when available, initials on `--muted` otherwise. */
export function InitialsAvatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-serif font-bold text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initialsOf(name)}
    </span>
  );
}

/** Brown junior grade tile (U17 / U15 …) with an accent code. */
export function JuniorGradeTile({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm font-serif text-[13px] font-bold text-[hsl(var(--primary))]",
        className,
      )}
      style={{ background: "var(--juniors-accent)" }}
    >
      {code}
    </span>
  );
}

/**
 * Latest-results row: badge, opponent + meta, stacked scores, round W/L pill.
 * Full-bleed inside its card (negative side margin) with a hairline top border.
 */
export function ResultRow({
  href,
  badge,
  title,
  meta,
  ours,
  theirs,
  result,
  className,
}: {
  href?: string;
  badge: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  ours?: ReactNode;
  theirs?: ReactNode;
  result?: string | null;
  className?: string;
}) {
  const inner = (
    <>
      {badge}
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-semibold">{title}</div>
        {meta && <div className="truncate text-[13px] text-muted-foreground">{meta}</div>}
      </div>
      {(ours || theirs) && (
        <div className="text-right tabular-nums">
          {ours && <div className="font-serif text-lg font-bold leading-tight">{ours}</div>}
          {theirs && <div className="text-sm text-muted-foreground">{theirs}</div>}
        </div>
      )}
      <ResultPill result={result} round />
    </>
  );
  const cls = cn(
    "-mx-2 flex items-center gap-3 rounded-sm border-t px-2 py-3.5 transition-colors first:border-t-0 hover:bg-muted",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Top-performer row with an animated progress bar sized against the leader. */
export function LeaderRow({
  rank,
  name,
  avatar,
  meta,
  value,
  max,
  href,
}: {
  rank: number;
  name: string;
  avatar?: string | null;
  meta?: ReactNode;
  value: number;
  max: number;
  href?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const body = (
    <>
      <span className="w-[18px] shrink-0 font-serif text-sm text-muted-foreground tabular-nums">
        {rank}
      </span>
      <InitialsAvatar name={name} src={avatar} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold">{name}</span>
          {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 [transition-timing-function:cubic-bezier(.2,.8,.2,1)]"
            style={{ width: `${pct}%` }}
            data-testid="leader-bar"
          />
        </div>
      </div>
      <span className="w-[52px] shrink-0 text-right font-serif text-[22px] font-bold tabular-nums">
        {value.toLocaleString()}
      </span>
    </>
  );
  const cls = "flex items-center gap-3 rounded-sm py-2";
  return href ? (
    <Link href={href} className={cn(cls, "-mx-2 px-2 hover:bg-muted")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
