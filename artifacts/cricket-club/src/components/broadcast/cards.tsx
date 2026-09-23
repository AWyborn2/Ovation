import type { ReactNode } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

/**
 * Explore-the-club photo card (16/11). The photo zooms on hover; with no image
 * a brand-tinted gradient stands in so a tenant never shows another's photo.
 */
export function PhotoCard({
  href,
  image,
  title,
  description,
  className,
}: {
  href: string;
  image?: string | null;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative isolate block aspect-[16/11] overflow-hidden rounded-lg border transition-shadow duration-300 hover:shadow-[var(--shadow-pop)]",
        className,
      )}
    >
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-[600ms] [transition-timing-function:cubic-bezier(.2,.8,.2,1)] group-hover:scale-105"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 -z-10 transition-transform duration-[600ms] group-hover:scale-105"
          style={{
            background:
              "radial-gradient(ellipse at 75% 20%, hsl(var(--primary) / .35), transparent 60%), linear-gradient(160deg, #1B242B, #0B1014)",
          }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: "linear-gradient(0deg, rgba(0,0,0,.85), rgba(0,0,0,.1) 60%)" }}
      />
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <div className="font-serif text-[22px] font-bold uppercase leading-none">{title}</div>
        {description && <div className="mt-1 text-[13px] opacity-80">{description}</div>}
      </div>
    </Link>
  );
}

/** Card-wrapped horizontally scrolling table; `stickyFirst` pins column 1. */
export function TableCard({
  children,
  minWidth = 760,
  stickyFirst,
  className,
}: {
  children: ReactNode;
  minWidth?: number;
  stickyFirst?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border bg-card", className)}>
      <table
        className={cn("w-full border-collapse text-sm", stickyFirst && "bc-sticky-first")}
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  );
}

/** Table header cell: 11px uppercase overline; `num` right-aligns. */
export function Th({
  children,
  num,
  className,
}: {
  children?: ReactNode;
  num?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "h-10 whitespace-nowrap px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
        num ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

/** Table body cell; `num` right-aligns with tabular figures. */
export function Td({
  children,
  num,
  strong,
  className,
}: {
  children?: ReactNode;
  num?: boolean;
  strong?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3 py-2.5",
        num && "text-right tabular-nums",
        strong && "font-semibold",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Hoverable table row with a hairline top border; clickable when `onClick`. */
export function Tr({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-t transition-colors hover:bg-muted",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

/** Milestones timeline: accent ring + hairline connector. */
export function Timeline({
  items,
  className,
}: {
  items: { key: string; label: ReactNode; title: ReactNode }[];
  className?: string;
}) {
  return (
    <ol className={cn("relative space-y-5", className)}>
      {items.map((it, i) => (
        <li key={it.key} className="relative pl-7">
          {i < items.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[5px] top-4 h-[calc(100%+8px)] w-0.5 bg-border"
            />
          )}
          <span
            aria-hidden
            className="absolute left-0 top-1 h-3 w-3 rounded-full border-2 border-primary bg-card"
          />
          <div className="text-xs font-semibold text-muted-foreground">{it.label}</div>
          <div className="font-semibold">{it.title}</div>
        </li>
      ))}
    </ol>
  );
}
