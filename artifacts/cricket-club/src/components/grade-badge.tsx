interface GradeMeta {
  full: string;
  abbr: string;
  bannerShort: string;
  bannerLong: string;
  sortOrder: number;
}

const META: Record<string, GradeMeta> = {
  "A Grade":        { full: "A Grade",        abbr: "A",   bannerShort: "A GRADE",  bannerLong: "A GRADE",         sortOrder: 1 },
  "B Grade":        { full: "B Grade",        abbr: "B",   bannerShort: "B GRADE",  bannerLong: "B GRADE",         sortOrder: 2 },
  "C Grade":        { full: "C Grade",        abbr: "C",   bannerShort: "C GRADE",  bannerLong: "C GRADE",         sortOrder: 3 },
  "D Grade":        { full: "D Grade",        abbr: "D",   bannerShort: "D GRADE",  bannerLong: "D GRADE",         sortOrder: 4 },
  "E Grade":        { full: "E Grade",        abbr: "E",   bannerShort: "E GRADE",  bannerLong: "E GRADE",         sortOrder: 5 },
  "F Grade":        { full: "F Grade",        abbr: "F",   bannerShort: "F GRADE",  bannerLong: "F GRADE",         sortOrder: 6 },
  "Female A Grade": { full: "Female A Grade", abbr: "FA",  bannerShort: "FEM A",    bannerLong: "FEMALE A",        sortOrder: 7 },
  "Female B Grade": { full: "Female B Grade", abbr: "FB",  bannerShort: "FEM B",    bannerLong: "FEMALE B",        sortOrder: 8 },
  "PPL":            { full: "PPL",            abbr: "PPL", bannerShort: "PPL",      bannerLong: "PPL",             sortOrder: 9 },
  "Colts":          { full: "Colts",          abbr: "Co",  bannerShort: "COLTS",    bannerLong: "COLTS",           sortOrder: 10 },
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

const SIZE_PX: Record<Size, number> = { sm: 40, md: 64, lg: 104 };

// Template palette (matches the HHCC badge PNG)
const GOLD = "#F2B544";
const GOLD_DARK = "#B07A1F";
const INK = "#2A1F12";

interface GradeBadgeProps {
  grade: string;
  size?: Size;
  className?: string;
}

/**
 * HHCC crest badge — SVG rebuild of the club badge template.
 * Gold diamond with ink-coloured inner fill, gold ribbon banner underneath,
 * grade abbreviation on the diamond, grade label on the ribbon.
 */
export const GradeBadge = ({ grade, size = "sm", className }: GradeBadgeProps) => {
  const meta = getMeta(grade);
  const px = SIZE_PX[size];
  const bannerText = size === "lg" ? meta.bannerLong : meta.bannerShort;

  const abbrLen = meta.abbr.length;
  const abbrFontSize = abbrLen >= 3 ? 26 : abbrLen === 2 ? 32 : 44;
  const bannerFontSize = bannerText.length > 6 ? 9 : bannerText.length > 4 ? 10.5 : 12;

  // Outer diamond (square rotated 45°), points slightly inset so we have room
  // for the dark drop shadow / stroke.
  const diamondOuter = "M50 6 L94 50 L50 86 L6 50 Z";
  const diamondInner = "M50 14 L86 50 L50 78 L14 50 Z";

  // Ribbon: a banner that sits underneath the diamond and dips at the centre
  // following the diamond's lower point. Two trailing tails on either end.
  // Coordinate system: 100 wide, sits between y=74 and y=110.
  const ribbon =
    // left tail
    "M2 80 L14 76 L14 86 " +
    // left main body sweeping up and across the diamond bottom
    "L22 82 Q40 86 50 92 Q60 86 78 82 L86 86 L86 76 L98 80 " +
    // right tail bottom
    "L92 92 L86 90 L86 98 L74 94 " +
    // bottom of right main body, back across to left
    "Q60 98 50 102 Q40 98 26 94 L14 98 L14 90 L8 92 Z";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 110"
      width={px}
      height={Math.round(px * 1.1)}
      className={`inline-block shrink-0 ${className ?? ""}`}
      role="img"
      aria-label={meta.full}
    >
      <title>{meta.full}</title>

      {/* --- Ribbon (drawn first so the diamond sits on top) --- */}
      <path d={ribbon} fill={GOLD} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      {/* Inner shadow line on ribbon for depth */}
      <path
        d="M14 86 L22 82 Q40 86 50 92 Q60 86 78 82 L86 86"
        fill="none"
        stroke={GOLD_DARK}
        strokeOpacity="0.55"
        strokeWidth="0.8"
      />

      {/* --- Diamond --- */}
      <path d={diamondOuter} fill={GOLD} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d={diamondInner} fill={INK} />

      {/* Grade abbreviation centred on the diamond */}
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="bold"
        fontSize={abbrFontSize}
        fill={GOLD}
      >
        {meta.abbr}
      </text>

      {/* Banner text */}
      <text
        x="50"
        y="91"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="bold"
        fontSize={bannerFontSize}
        fill={INK}
        letterSpacing="0.6"
      >
        {bannerText}
      </text>
    </svg>
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
