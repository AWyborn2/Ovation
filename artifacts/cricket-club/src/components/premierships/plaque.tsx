import type { ReactNode } from "react";
import { Link } from "wouter";

/**
 * The engraved silver plaque shared by the senior and junior premiership
 * boards. Only the frame, typography and the common lines (player, M.O.M,
 * result) live here — each board supplies its own plaque content because the
 * two records carry different fields (grade/year vs age group/season, …).
 */

export const PLAQUE_FONT = "'Inter', sans-serif";
const TRACK = "0.0103em";

/** "YYYY-MM-DD…" → "DD/MM/YYYY"; anything else is returned as-is. */
export const formatPlaqueDate = (d: string | null | undefined) => {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

export const PLAQUE_STYLES = {
  /** Board title line (grade / age group). */
  title: { fontSize: "10.9px", letterSpacing: 0, lineHeight: 1.4, fontWeight: 700 },
  /** Venue / date / competition lines. */
  meta: { fontSize: "6.4px", letterSpacing: TRACK, lineHeight: 1.4, fontWeight: 700 },
  /** The team list. */
  roster: { fontSize: "6.7px", letterSpacing: TRACK, lineHeight: 1.0, fontWeight: 700 },
  /** M.O.M and result lines. */
  result: { fontSize: "6.7px", letterSpacing: TRACK, lineHeight: 1.4, fontWeight: 700 },
} as const;

/** The 151×259 brushed-metal frame with its double inner border. */
export function PlaqueFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative shadow-md border border-slate-900/60 overflow-hidden"
      style={{
        width: "151px",
        height: "259px",
        background:
          "linear-gradient(135deg, #c8ccd1 0%, #e8ebee 20%, #b8bdc4 40%, #d8dce0 60%, #aeb3ba 80%, #c8ccd1 100%)",
        fontFamily: PLAQUE_FONT,
        padding: "4px",
      }}
    >
      <div className="h-full border-slate-800" style={{ borderWidth: "1px", padding: "1px" }}>
        <div
          className="h-full text-center flex flex-col border border-slate-800 overflow-hidden"
          style={{
            color: "#0f172a",
            fontFamily: PLAQUE_FONT,
            paddingInline: "5px",
            paddingBlock: "6px",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** One roster line; links to the player page when `href` is given. */
export function PlaqueLine({ href, label }: { href: string | null; label: string }) {
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="block whitespace-nowrap text-slate-900 hover:underline font-semibold text-[9px]"
        >
          {label}
        </Link>
      ) : (
        <span className="block whitespace-nowrap text-slate-900 font-semibold text-[9px]">
          {label}
        </span>
      )}
    </li>
  );
}

/** "M.O.M - NAME" line, omitted when there is no man of the match. */
export function PlaqueMom({ mom }: { mom: string | null | undefined }) {
  if (!mom) return null;
  return (
    <div
      style={{ ...PLAQUE_STYLES.result, marginBottom: "4px" }}
      className="text-[10px] pt-[10px] pb-[10px] text-center font-bold"
    >
      M.O.M - {mom.toUpperCase()}
    </div>
  );
}

/** The "A DEF B" result line; links to the deciding scorecard when `href` is given. */
export function PlaqueResult({
  result,
  href,
  title,
}: {
  result: string | null | undefined;
  href: string | null;
  title: string;
}) {
  if (!result) return null;
  const text = result.replace(/\s+def\s+/i, "\nDEF\n").toUpperCase();
  return href ? (
    <Link
      href={href}
      style={{ ...PLAQUE_STYLES.result, whiteSpace: "pre-line" }}
      className="text-[12px] font-bold block hover:underline cursor-pointer"
      title={title}
    >
      {text}
    </Link>
  ) : (
    <div
      style={{ ...PLAQUE_STYLES.result, whiteSpace: "pre-line" }}
      className="text-[12px] font-bold"
    >
      {text}
    </div>
  );
}
