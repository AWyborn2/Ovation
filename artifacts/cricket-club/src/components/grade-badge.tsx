import iconGold from "@assets/HHCC_Icon_Gold_1779853335292.png";

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

const GOLD = "#F2B544";

interface GradeBadgeProps {
  grade: string;
  size?: Size;
  className?: string;
}

/**
 * HHCC gold outline crest badge.
 *
 * Uses the transparent gold-outline icon PNG as the visual frame and overlays:
 *  - the grade abbreviation centred inside the diamond
 *  - the grade label on the ribbon
 *
 * Coordinates are tuned to the 1024x1024 source: the diamond's visual centre
 * is ~33% from the top and the ribbon's text band sits ~71% from the top.
 */
export const GradeBadge = ({ grade, size = "sm", className }: GradeBadgeProps) => {
  const meta = getMeta(grade);
  const px = SIZE_PX[size];

  // Single label rendered in the diamond's visual centre.
  const diamondLabel = size === "lg" ? meta.bannerLong : meta.bannerShort;
  const diamondScale =
    diamondLabel.length > 7 ? 0.075 : diamondLabel.length > 5 ? 0.09 : 0.11;
  const diamondFontPx = Math.max(7, px * diamondScale);

  // Stack same-colour drop-shadows to visually thicken the PNG's gold outline
  // so it matches the heavier stroke weight of the club's other crest icons.
  const strokeBoost =
    `drop-shadow(0 0 0.3px ${GOLD}) drop-shadow(0 0 0.3px ${GOLD})`;

  return (
    <div
      role="img"
      aria-label={meta.full}
      title={meta.full}
      className={`relative inline-block shrink-0 select-none ${className ?? ""}`}
      style={{ width: px, height: px }}
    >
      <img
        src={iconGold}
        alt=""
        draggable={false}
        className="block h-full w-full object-contain"
        style={{ filter: strokeBoost }}
      />

      {/* Grade label centred in the diamond's visual centre */}
      <span
        className="pointer-events-none absolute font-serif font-bold leading-none"
        style={{
          left: "50%",
          top: "45%",
          transform: "translate(-50%, -50%)",
          fontSize: diamondFontPx,
          color: GOLD,
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
