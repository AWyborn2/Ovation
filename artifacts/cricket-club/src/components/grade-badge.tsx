interface GradeMeta {
  full: string;
  abbr: string;
  bannerShort: string;
  bannerLong: string;
  accent: string;
  sortOrder: number;
}

const META: Record<string, GradeMeta> = {
  "A Grade":        { full: "A Grade",        abbr: "A",   bannerShort: "A",       bannerLong: "A GRADE",        accent: "#F2B544", sortOrder: 1 },
  "B Grade":        { full: "B Grade",        abbr: "B",   bannerShort: "B",       bannerLong: "B GRADE",        accent: "#CBD5E1", sortOrder: 2 },
  "C Grade":        { full: "C Grade",        abbr: "C",   bannerShort: "C",       bannerLong: "C GRADE",        accent: "#C78A4A", sortOrder: 3 },
  "D Grade":        { full: "D Grade",        abbr: "D",   bannerShort: "D",       bannerLong: "D GRADE",        accent: "#7BA8D9", sortOrder: 4 },
  "E Grade":        { full: "E Grade",        abbr: "E",   bannerShort: "E",       bannerLong: "E GRADE",        accent: "#9BA8C9", sortOrder: 5 },
  "F Grade":        { full: "F Grade",        abbr: "F",   bannerShort: "F",       bannerLong: "F GRADE",        accent: "#A89BC9", sortOrder: 6 },
  "Female A Grade": { full: "Female A Grade", abbr: "FA",  bannerShort: "FEM A",   bannerLong: "FEMALE A GRADE", accent: "#2DD4BF", sortOrder: 7 },
  "Female B Grade": { full: "Female B Grade", abbr: "FB",  bannerShort: "FEM B",   bannerLong: "FEMALE B GRADE", accent: "#F472B6", sortOrder: 8 },
  "PPL":            { full: "PPL",            abbr: "PPL", bannerShort: "PPL",     bannerLong: "PPL",            accent: "#C084FC", sortOrder: 9 },
  "Colts":          { full: "Colts",          abbr: "Co",  bannerShort: "COLTS",   bannerLong: "COLTS",          accent: "#4ADE80", sortOrder: 10 },
};

const FALLBACK_ACCENT = "#F2B544";

const getMeta = (grade: string): GradeMeta => {
  return META[grade] ?? {
    full: grade,
    abbr: grade.slice(0, 2).toUpperCase(),
    bannerShort: grade.toUpperCase().slice(0, 8),
    bannerLong: grade.toUpperCase(),
    accent: FALLBACK_ACCENT,
    sortOrder: 99,
  };
};

export const sortGradesBySeniority = (grades: Iterable<string>): string[] =>
  Array.from(grades).sort((a, b) => getMeta(a).sortOrder - getMeta(b).sortOrder);

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 28, md: 44, lg: 72 };

interface GradeBadgeProps {
  grade: string;
  size?: Size;
  className?: string;
}

export const GradeBadge = ({ grade, size = "sm", className }: GradeBadgeProps) => {
  const meta = getMeta(grade);
  const px = SIZE_PX[size];
  const showBanner = size !== "sm";
  const bannerText = size === "lg" ? meta.bannerLong : meta.bannerShort;

  // Diamond points (rotated square) in 100x120 viewBox
  // Top, right, bottom, left
  const diamond = "M50,6 L92,48 L50,90 L8,48 Z";

  // Ribbon banner under the diamond (medium/large only)
  const banner =
    "M6,86 L94,86 L98,104 L86,100 L86,110 L74,103 L26,103 L14,110 L14,100 L2,104 Z";

  // Bigger abbr text needs smaller font; "PPL" needs to fit too
  const abbrLen = meta.abbr.length;
  const letterSize = abbrLen >= 3 ? 32 : abbrLen === 2 ? 40 : 52;
  const bannerFontSize = size === "lg" ? (bannerText.length > 10 ? 12 : 14) : (bannerText.length > 6 ? 10 : 11);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={showBanner ? "0 0 100 115" : "0 0 100 96"}
      width={px}
      height={showBanner ? Math.round(px * 1.15) : Math.round(px * 0.96)}
      className={`inline-block shrink-0 drop-shadow-sm ${className ?? ""}`}
      role="img"
      aria-label={meta.full}
    >
      <title>{meta.full}</title>

      {/* Diamond */}
      <path
        d={diamond}
        fill="hsl(207 17% 18%)"
        stroke={meta.accent}
        strokeWidth="4"
        strokeLinejoin="round"
      />

      {/* Inner diamond outline for crest depth */}
      <path
        d="M50,16 L82,48 L50,80 L18,48 Z"
        fill="none"
        stroke={meta.accent}
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />

      {/* Letter */}
      <text
        x="50"
        y="48"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="bold"
        fontSize={letterSize}
        fill={meta.accent}
      >
        {meta.abbr}
      </text>

      {showBanner && (
        <>
          <path
            d={banner}
            fill={meta.accent}
            stroke="hsl(207 17% 18%)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <text
            x="50"
            y="95"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontWeight="bold"
            fontSize={bannerFontSize}
            letterSpacing="1"
            fill="hsl(207 17% 18%)"
          >
            {bannerText}
          </text>
        </>
      )}
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
    <div className={`inline-flex flex-wrap gap-1.5 items-center ${className ?? ""}`}>
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
