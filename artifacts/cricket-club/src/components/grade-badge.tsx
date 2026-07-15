import { useContext } from "react";
import { BadgeStyleContext } from "@/lib/brand-context";

interface GradeMeta {
  full: string;
  abbr: string;
  bannerShort: string;
  bannerLong: string;
  sortOrder: number;
}

const META: Record<string, GradeMeta> = {
  "A Grade":        { full: "A Grade",        abbr: "A",   bannerShort: "A GRADE",  bannerLong: "A GRADE",   sortOrder: 1 },
  "B Grade":        { full: "B Grade",        abbr: "B",   bannerShort: "B GRADE",  bannerLong: "B GRADE",   sortOrder: 2 },
  "C Grade":        { full: "C Grade",        abbr: "C",   bannerShort: "C GRADE",  bannerLong: "C GRADE",   sortOrder: 3 },
  "D Grade":        { full: "D Grade",        abbr: "D",   bannerShort: "D GRADE",  bannerLong: "D GRADE",   sortOrder: 4 },
  "E Grade":        { full: "E Grade",        abbr: "E",   bannerShort: "E GRADE",  bannerLong: "E GRADE",   sortOrder: 5 },
  "F Grade":        { full: "F Grade",        abbr: "F",   bannerShort: "F GRADE",  bannerLong: "F GRADE",   sortOrder: 6 },
  "Female A Grade": { full: "Female A Grade", abbr: "FA",  bannerShort: "FEM A",    bannerLong: "FEMALE A",  sortOrder: 7 },
  "Female B Grade": { full: "Female B Grade", abbr: "FB",  bannerShort: "FEM B",    bannerLong: "FEMALE B",  sortOrder: 8 },
  "PPL":            { full: "PPL",            abbr: "PPL", bannerShort: "PPL",      bannerLong: "PPL",       sortOrder: 9 },
  "Colts":          { full: "Colts",          abbr: "Co",  bannerShort: "COLTS",    bannerLong: "COLTS",     sortOrder: 10 },
};

const getMeta = (grade: string): GradeMeta => {
  return META[grade] ?? {
    full: grade,
    abbr: grade.slice(0, 2).toUpperCase(),
    bannerShort: grade.toUpperCase().slice(0, 8),
    bannerLong: grade.toUpperCase(),
    sortOrder: 99,
  };
};

export const sortGradesBySeniority = (grades: Iterable<string>): string[] =>
  Array.from(grades).sort((a, b) => getMeta(a).sortOrder - getMeta(b).sortOrder);

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 44, md: 68, lg: 112 };

const ACCENT = "hsl(var(--accent))";

export type BadgeStyle = "diamond" | "shield" | "hexagon" | "oval" | "crest";

export const BADGE_STYLE_LABELS: Record<BadgeStyle, string> = {
  diamond: "Diamond",
  shield: "Shield",
  hexagon: "Hexagon",
  oval: "Oval",
  crest: "Crest",
};

export const BADGE_STYLE_ORDER: BadgeStyle[] = ["diamond", "shield", "hexagon", "oval", "crest"];

type BadgeRenderFn = (px: number, accent: string) => React.ReactNode;

const BADGE_STYLES: Record<BadgeStyle, BadgeRenderFn> = {
  diamond: (px, accent) => (
    <svg width={px} height={px} viewBox="0 0 100 100" fill="none" aria-hidden>
      <polygon
        points="50,5 95,50 50,95 5,50"
        stroke={accent}
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  shield: (px, accent) => (
    <svg width={px} height={px} viewBox="0 0 100 100" fill="none" aria-hidden>
      <path
        d="M50,7 L93,22 L93,56 Q93,82 50,95 Q7,82 7,56 L7,22 Z"
        stroke={accent}
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  hexagon: (px, accent) => (
    <svg width={px} height={px} viewBox="0 0 100 100" fill="none" aria-hidden>
      <polygon
        points="50,5 93,27.5 93,72.5 50,95 7,72.5 7,27.5"
        stroke={accent}
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  oval: (px, accent) => (
    <svg width={px} height={px} viewBox="0 0 100 100" fill="none" aria-hidden>
      <ellipse cx="50" cy="50" rx="44" ry="34" stroke={accent} strokeWidth="5" />
    </svg>
  ),
  crest: (px, accent) => (
    <svg width={px} height={px} viewBox="0 0 100 100" fill="none" aria-hidden>
      <polygon
        points="50,5 95,50 50,95 5,50"
        stroke={accent}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <polygon
        points="50,20 80,50 50,80 20,50"
        stroke={accent}
        strokeWidth="2.5"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </svg>
  ),
};

interface GradeBadgeProps {
  grade: string;
  size?: Size;
  className?: string;
  badgeStyle?: BadgeStyle;
}

/**
 * Cricket-style SVG grade badge. The shape is controlled by the tenant's
 * `badgeStyle` brand setting (read from `BadgeStyleContext`) and recolours
 * automatically via the `--accent` CSS token, so every tenant's accent
 * drives the badge without any hardcoded colours.
 *
 * An explicit `badgeStyle` prop overrides the context — used by the admin
 * badge-style picker for live preview of each shape.
 */
export const GradeBadge = ({ grade, size = "sm", className, badgeStyle: badgeStyleProp }: GradeBadgeProps) => {
  const contextStyle = useContext(BadgeStyleContext);
  const activeStyle: BadgeStyle = (badgeStyleProp ?? contextStyle) as BadgeStyle;

  const meta = getMeta(grade);
  const px = SIZE_PX[size];

  const diamondLabel = size === "lg" ? meta.bannerLong : meta.bannerShort;
  const diamondScale =
    diamondLabel.length > 7 ? 0.075 : diamondLabel.length > 5 ? 0.09 : 0.11;
  const diamondFontPx = Math.max(7, px * diamondScale);

  const renderBadge = BADGE_STYLES[activeStyle] ?? BADGE_STYLES.diamond;

  return (
    <div
      role="img"
      aria-label={meta.full}
      title={meta.full}
      className={`relative inline-block shrink-0 select-none ${className ?? ""}`}
      style={{ width: px, height: px }}
    >
      {renderBadge(px, ACCENT)}

      <span
        className="pointer-events-none absolute font-serif font-bold leading-none"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: diamondFontPx,
          color: ACCENT,
          letterSpacing: "0.05em",
          whiteSpace: "nowrap",
        }}
      >
        {diamondLabel}
      </span>
    </div>
  );
};

interface GradeBadgeListProps {
  grades: Iterable<string>;
  size?: Size;
  className?: string;
}

export const GradeBadgeList = ({ grades, size = "sm", className }: GradeBadgeListProps) => {
  const sorted = sortGradesBySeniority(grades);
  if (sorted.length === 0) return <span className="text-xs text-muted-foreground italic">—</span>;
  return (
    <div className={`inline-flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
      {sorted.map((g) => (
        <GradeBadge key={g} grade={g} size={size} />
      ))}
    </div>
  );
};

/**
 * Comma-separated grade string (as stored on `players.gradesPlayed`) → badge list.
 */
export const GradeBadgeListFromString = ({
  gradesPlayed,
  size = "sm",
  className,
}: {
  gradesPlayed: string | null | undefined;
  size?: Size;
  className?: string;
}) => {
  const grades = (gradesPlayed ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g.length > 0 && g !== "CLUB TOTAL");
  return <GradeBadgeList grades={grades} size={size} className={className} />;
};
