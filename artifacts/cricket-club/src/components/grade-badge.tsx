import badgeTemplate from "@assets/HHCC_Badge_ICON_Template_1779852473312.png";

interface GradeMeta {
  full: string;
  abbr: string;
  bannerShort: string;
  bannerLong: string;
  accent: string;
  sortOrder: number;
}

const META: Record<string, GradeMeta> = {
  "A Grade":        { full: "A Grade",        abbr: "A",   bannerShort: "A GRADE",     bannerLong: "A GRADE",        accent: "#F2B544", sortOrder: 1 },
  "B Grade":        { full: "B Grade",        abbr: "B",   bannerShort: "B GRADE",     bannerLong: "B GRADE",        accent: "#F2B544", sortOrder: 2 },
  "C Grade":        { full: "C Grade",        abbr: "C",   bannerShort: "C GRADE",     bannerLong: "C GRADE",        accent: "#F2B544", sortOrder: 3 },
  "D Grade":        { full: "D Grade",        abbr: "D",   bannerShort: "D GRADE",     bannerLong: "D GRADE",        accent: "#F2B544", sortOrder: 4 },
  "E Grade":        { full: "E Grade",        abbr: "E",   bannerShort: "E GRADE",     bannerLong: "E GRADE",        accent: "#F2B544", sortOrder: 5 },
  "F Grade":        { full: "F Grade",        abbr: "F",   bannerShort: "F GRADE",     bannerLong: "F GRADE",        accent: "#F2B544", sortOrder: 6 },
  "Female A Grade": { full: "Female A Grade", abbr: "FA",  bannerShort: "FEM A",       bannerLong: "FEMALE A",       accent: "#F2B544", sortOrder: 7 },
  "Female B Grade": { full: "Female B Grade", abbr: "FB",  bannerShort: "FEM B",       bannerLong: "FEMALE B",       accent: "#F2B544", sortOrder: 8 },
  "PPL":            { full: "PPL",            abbr: "PPL", bannerShort: "PPL",         bannerLong: "PPL",            accent: "#F2B544", sortOrder: 9 },
  "Colts":          { full: "Colts",          abbr: "Co",  bannerShort: "COLTS",       bannerLong: "COLTS",          accent: "#F2B544", sortOrder: 10 },
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

const SIZE_PX: Record<Size, number> = { sm: 44, md: 64, lg: 104 };

interface GradeBadgeProps {
  grade: string;
  size?: Size;
  className?: string;
}

/**
 * HHCC crest badge. Renders the club's badge template (gold diamond + ribbon)
 * with the grade abbreviation overlaid on the diamond and a grade-specific
 * label painted over the banner's placeholder "GRADE" text.
 *
 * Layout percentages are tuned to the 1024x1024 template image. The diamond's
 * visual centre sits ~38% from the top; the banner text sits ~67% from the
 * top.
 */
export const GradeBadge = ({ grade, size = "sm", className }: GradeBadgeProps) => {
  const meta = getMeta(grade);
  const px = SIZE_PX[size];
  // Always show the banner overlay so the grade is identifiable at any size.
  const bannerText = size === "lg" ? meta.bannerLong : meta.bannerShort;

  // Abbreviation font scales with badge size; long abbreviations shrink.
  const abbrLen = meta.abbr.length;
  const abbrFontPx =
    abbrLen >= 3 ? px * 0.26 : abbrLen === 2 ? px * 0.32 : px * 0.42;

  // Banner text + cover strip dimensions
  const bannerFontPx = Math.max(7, px * 0.1);

  return (
    <div
      role="img"
      aria-label={meta.full}
      title={meta.full}
      className={`relative inline-block shrink-0 select-none ${className ?? ""}`}
      style={{ width: px, height: px }}
    >
      <img
        src={badgeTemplate}
        alt=""
        draggable={false}
        className="block h-full w-full object-contain"
      />

      {/* Grade abbreviation on the diamond */}
      <span
        className="pointer-events-none absolute font-serif font-bold leading-none"
        style={{
          left: "50%",
          top: "36%",
          transform: "translate(-50%, -50%)",
          fontSize: abbrFontPx,
          color: "hsl(207 17% 14%)",
          letterSpacing: abbrLen >= 3 ? "0" : "0.02em",
        }}
      >
        {meta.abbr}
      </span>

      {/* Banner label: covers the template's placeholder "GRADE" text */}
      <span
        className="pointer-events-none absolute flex items-center justify-center font-serif font-bold leading-none"
        style={{
          left: "22%",
          right: "22%",
          top: "62%",
          height: `${Math.max(9, px * 0.13)}px`,
          backgroundColor: meta.accent,
          color: "hsl(207 17% 14%)",
          fontSize: bannerFontPx,
          letterSpacing: "0.04em",
          borderRadius: 1,
        }}
      >
        {bannerText}
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
